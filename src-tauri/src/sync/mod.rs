//! M4m 同步模块（docs/07-移动端.md §5 v1）：整库快照 gzip 单文件 + rev 读前检测 + 整库 LWW
//! + 覆盖前备份 + 运行锁（TTL 标记 / 显式接管）。
//!
//! 远程布局（base = 用户 WebDAV 根，如 https://dav.jianguoyun.com/dav/）：
//!   {base}/fermata/snapshot.json.gz      全库快照（gzip，复用 *.fermata.json 格式）
//!   {base}/fermata/snapshot.meta.json    { rev, device_id, device_name, generated_at }
//!   {base}/fermata/locks/{device_id}.json 运行锁（TTL 10 分钟，生命周期事件与 5 分钟心跳刷新）
//!   {base}/fermata/backups/              首接冲突选「推送覆盖」时对远端快照的强制备份
//!
//! 本机同步状态在 settings 表 sync_* 键（不同步：恢复快照时保留本机 sync_* 与外观键，
//! 仅计时参数 slice_minutes / continuous_limit_minutes / rest_mode / idle_threshold_minutes 随快照走）。
//! 凭据：桌面走系统钥匙串（Windows 凭据管理器），Android 暂以应用私有目录文件过渡（记 deviation，M5m 换 Keystore）。
//! v1 冲突语义：基线之后远端先动且本机也改了 → 远端赢，本机被覆盖前自动备份（exports/backup-*.fermata.json），
//! UI 提示可经手动导入还原；绝不静默丢任何一端。

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::{self, snapshot};

/// 运行锁 TTL：超过未刷新即视为「可能仍在运行」，由用户显式决定
pub const LOCK_TTL_MS: i64 = 10 * 60_000;
/// 随快照同步的计时参数；其余设置（外观 / 热键 / sync_* / device_id）一律留本机
const TIMING_KEYS: &[&str] = &[
    "slice_minutes",
    "continuous_limit_minutes",
    "rest_mode",
    "idle_threshold_minutes",
];

// ---------- 凭据 ----------

#[cfg(desktop)]
mod secret {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new("fermata", "webdav").map_err(|e| e.to_string())
    }
    pub fn get(_dir: &std::path::Path) -> Result<Option<String>, String> {
        match entry()?.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn set(_dir: &std::path::Path, p: &str) -> Result<(), String> {
        entry()?.set_password(p).map_err(|e| e.to_string())
    }
    pub fn clear(_dir: &std::path::Path) -> Result<(), String> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Android 过渡：应用私有目录明文文件（deviation D-安卓凭据，M5m 换 Keystore）。
/// dir 由命令侧传 app_data_dir。
#[cfg(not(desktop))]
mod secret {
    use std::path::Path;
    fn path(dir: &Path) -> std::path::PathBuf {
        dir.join("sync.secret")
    }
    pub fn get(dir: &Path) -> Result<Option<String>, String> {
        match std::fs::read_to_string(path(dir)) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn set(dir: &Path, s: &str) -> Result<(), String> {
        std::fs::write(path(dir), s).map_err(|e| e.to_string())
    }
    pub fn clear(dir: &Path) -> Result<(), String> {
        let p = path(dir);
        if p.exists() {
            std::fs::remove_file(p).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

// ---------- 配置与本机状态（settings 表） ----------

#[derive(Clone, Debug)]
pub struct Cfg {
    pub base: String,
    pub user: String,
    pub secret: String,
}

fn sget(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", rusqlite::params![key], |r| r.get(0))
        .ok()
}

fn sset(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 规范化 base：保证以 / 结尾
fn norm_base(url: &str) -> String {
    let u = url.trim().trim_end_matches('/');
    format!("{u}/")
}

/// 已配置？（凭据在钥匙串/私有文件，不在此判断）
pub fn configured(conn: &Connection) -> bool {
    sget(conn, "sync_url").is_some() && sget(conn, "sync_user").is_some()
}

pub fn device_id(conn: &Connection) -> Result<String, String> {
    sget(conn, "device_id").ok_or_else(|| "缺 device_id（v6 迁移未跑？）".to_string())
}

pub fn device_name() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Windows 设备".into())
    }
    #[cfg(target_os = "android")]
    {
        "Android 设备".to_string()
    }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    {
        std::env::var("HOSTNAME").unwrap_or_else(|_| "设备".into())
    }
}

fn event_max(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COALESCE(MAX(id), 0) FROM events", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

fn base_rev(conn: &Connection) -> i64 {
    sget(conn, "sync_base_rev").and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn dirty(conn: &Connection) -> Result<bool, String> {
    let base: i64 = sget(conn, "sync_base_event_max").and_then(|s| s.parse().ok()).unwrap_or(0);
    Ok(event_max(conn)? > base)
}

/// 读配置：settings 的 sync_url/sync_user + 凭据
pub fn load_cfg(conn: &Connection, app_dir: &std::path::Path) -> Result<Option<Cfg>, String> {
    let (Some(url), Some(user)) = (sget(conn, "sync_url"), sget(conn, "sync_user")) else {
        return Ok(None);
    };
    let Some(secret) = secret::get(app_dir)? else { return Ok(None) };
    Ok(Some(Cfg { base: norm_base(&url), user, secret }))
}

// ---------- WebDAV 原语 ----------

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn url_for(cfg: &Cfg, rel: &str) -> String {
    format!("{}{}", cfg.base, rel)
}

/// 空用户名 = 匿名（本机 wsgidav 测试服务），不带 Authorization 头
fn auth(r: reqwest::RequestBuilder, cfg: &Cfg) -> reqwest::RequestBuilder {
    if cfg.user.is_empty() {
        r
    } else {
        r.basic_auth(&cfg.user, Some(cfg.secret.as_str()))
    }
}

async fn dav_get(cfg: &Cfg, rel: &str) -> Result<Option<Vec<u8>>, String> {
    let r = auth(http().get(url_for(cfg, rel)), cfg)
        .send()
        .await
        .map_err(|e| format!("GET {rel} 失败: {e}"))?;
    if r.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !r.status().is_success() {
        return Err(format!("GET {rel} 返回 {}", r.status()));
    }
    r.bytes().await.map(|b| Some(b.to_vec())).map_err(|e| e.to_string())
}

async fn dav_put(cfg: &Cfg, rel: &str, body: Vec<u8>) -> Result<(), String> {
    let r = auth(http().put(url_for(cfg, rel)), cfg)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("PUT {rel} 失败: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("PUT {rel} 返回 {}", r.status()));
    }
    Ok(())
}

async fn dav_delete(cfg: &Cfg, rel: &str) -> Result<(), String> {
    let r = auth(http().delete(url_for(cfg, rel)), cfg)
        .send()
        .await
        .map_err(|e| format!("DELETE {rel} 失败: {e}"))?;
    if !r.status().is_success() && r.status() != reqwest::StatusCode::NOT_FOUND {
        return Err(format!("DELETE {rel} 返回 {}", r.status()));
    }
    Ok(())
}

async fn dav_mkcol(cfg: &Cfg, rel: &str) -> Result<(), String> {
    let r = auth(
        http().request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), url_for(cfg, rel)),
        cfg,
    )
    .send()
    .await
    .map_err(|e| format!("MKCOL {rel} 失败: {e}"))?;
    // 201 创建；405 已存在；409 父目录不存在（调用方负责先建父级）
    if r.status().is_success() || r.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED {
        return Ok(());
    }
    Err(format!("MKCOL {rel} 返回 {}", r.status()))
}

async fn ensure_dirs(cfg: &Cfg) -> Result<(), String> {
    dav_mkcol(cfg, "fermata/").await?;
    dav_mkcol(cfg, "fermata/locks/").await?;
    dav_mkcol(cfg, "fermata/backups/").await?;
    Ok(())
}

/// PROPFIND depth:1，返回该集合下的 .json 文件名列表（朴素解析 href，够用即可）
async fn dav_list_json(cfg: &Cfg, rel: &str) -> Result<Vec<String>, String> {
    let r = auth(
        http().request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), url_for(cfg, rel)),
        cfg,
    )
    .header("Depth", "1")
    .send()
    .await
    .map_err(|e| format!("PROPFIND {rel} 失败: {e}"))?;
    if r.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(vec![]);
    }
    let code = r.status().as_u16();
    if !r.status().is_success() && code != 207 {
        return Err(format!("PROPFIND {rel} 返回 {}", r.status()));
    }
    let body = r.text().await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut rest = body.as_str();
    while let Some(i) = rest.find("href>") {
        rest = &rest[i + 5..];
        if let Some(j) = rest.find('<') {
            let href = &rest[..j];
            if href.ends_with(".json") {
                if let Some(name) = href.rsplit('/').next() {
                    out.push(name.to_string());
                }
            }
            rest = &rest[j..];
        } else {
            break;
        }
    }
    Ok(out)
}

// ---------- 快照编解码 ----------

pub fn snapshot_gz(conn: &Connection) -> Result<Vec<u8>, String> {
    let v = snapshot::build_snapshot(conn)?;
    let raw = serde_json::to_vec(&v).map_err(|e| e.to_string())?;
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    use std::io::Write;
    enc.write_all(&raw).map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())
}

fn gunzip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut dec = flate2::read::GzDecoder::new(bytes);
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(|e| format!("gzip 解压失败: {e}"))?;
    Ok(out)
}

/// 远端快照落到本机：仅计时参数随快照，sync_* / 外观 / device_id 等其余设置保留本机
pub fn apply_remote(conn: &Connection, raw_json: &[u8]) -> Result<(), String> {
    let local_rows: Vec<(String, String)> = {
        let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        while let Some(r) = rows.next().map_err(|e| e.to_string())? {
            v.push((r.get(0).map_err(|e| e.to_string())?, r.get(1).map_err(|e| e.to_string())?));
        }
        v
    };
    let v: Value = serde_json::from_slice(raw_json).map_err(|e| format!("远端快照不是合法 JSON: {e}"))?;
    snapshot::import_snapshot(conn, &v)?;
    for (k, val) in local_rows {
        if !TIMING_KEYS.contains(&k.as_str()) {
            sset(conn, &k, &val)?;
        }
    }
    Ok(())
}

// ---------- 决策（纯函数，可测） ----------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Plan {
    /// 远端空 → 直接推 rev=1
    PushInitial,
    /// 远端 == 基线且本机有新写 → 推 rev+1
    Push(i64),
    Noop,
    /// 远端新于基线、本机没改 → 快进补
    PullFast,
    /// 基线之后远端先动、本机也改了 → v1 远端赢，本机先备份再覆盖
    PullConflict,
    /// 首次接入：远端有数据、本机也从未基于它 → 用户选方向（强制先备份）
    FirstConflict,
}

pub fn decide(remote: &Option<Meta>, base_rev: i64, dirty: bool) -> Plan {
    match remote {
        None => Plan::PushInitial,
        Some(m) if m.rev == base_rev => {
            if dirty { Plan::Push(base_rev + 1) } else { Plan::Noop }
        }
        Some(_) if base_rev == 0 => {
            if dirty { Plan::FirstConflict } else { Plan::PullFast }
        }
        Some(_) => {
            if dirty { Plan::PullConflict } else { Plan::PullFast }
        }
    }
}

// ---------- 远端 meta / 运行锁 ----------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Meta {
    pub rev: i64,
    pub device_id: String,
    pub device_name: String,
    pub generated_at: i64,
}

pub async fn fetch_meta(cfg: &Cfg) -> Result<Option<Meta>, String> {
    match dav_get(cfg, "fermata/snapshot.meta.json").await? {
        None => Ok(None),
        Some(b) => serde_json::from_slice(&b).map(Some).map_err(|e| format!("远端 meta 损坏: {e}")),
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RemoteLock {
    pub device_id: String,
    pub device_name: String,
    pub process_title: String,
    pub process_uuid: String,
    pub started_at: i64,
    pub written_at: i64,
    pub ttl_ms: i64,
}

impl RemoteLock {
    pub fn fresh(&self, now: i64) -> bool {
        now - self.written_at < self.ttl_ms
    }
}

/// 锁内读：当前运行进程 → 锁标记草稿（网络部分见 lock_sync）
pub fn lock_current(conn: &Connection) -> Result<Option<RemoteLock>, String> {
    let did = device_id(conn)?;
    let running: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT p.title, p.uuid, s.started_at FROM processes p
             JOIN segments s ON s.process_id = p.id AND s.ended_at IS NULL
             WHERE p.state = 'running' LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    Ok(running.map(|(title, uuid, started)| RemoteLock {
        device_id: did,
        device_name: device_name(),
        process_title: title,
        process_uuid: uuid,
        started_at: started,
        written_at: db::now_ms(),
        ttl_ms: LOCK_TTL_MS,
    }))
}

/// 网络侧：发布/清除本机锁标记
pub async fn lock_sync(cfg: &Cfg, lock: Option<&RemoteLock>, self_id: &str) -> Result<&'static str, String> {
    let rel = format!("fermata/locks/{self_id}.json");
    match lock {
        Some(l) => {
            dav_put(cfg, &rel, serde_json::to_vec(l).map_err(|e| e.to_string())?).await?;
            Ok("written")
        }
        None => {
            dav_delete(cfg, &rel).await?;
            Ok("cleared")
        }
    }
}

/// 读其他设备的运行锁（按 TTL 标 fresh/stale）
pub async fn lock_read_others(cfg: &Cfg, self_id: &str) -> Result<Vec<RemoteLock>, String> {
    let names = dav_list_json(cfg, "fermata/locks/").await?;
    let mut out = Vec::new();
    for name in names {
        if name == format!("{self_id}.json") {
            continue;
        }
        if let Some(b) = dav_get(cfg, &format!("fermata/locks/{name}")).await? {
            if let Ok(l) = serde_json::from_slice::<RemoteLock>(&b) {
                if l.device_id != self_id {
                    out.push(l);
                }
            }
        }
    }
    Ok(out)
}

// ---------- 编排 ----------

#[derive(Debug, Clone, serde::Serialize)]
pub struct Outcome {
    pub status: String,
    pub detail: String,
    pub rev: i64,
}

fn ok(status: &str, detail: impl Into<String>, rev: i64) -> Outcome {
    Outcome { status: status.into(), detail: detail.into(), rev }
}

pub enum Force {
    Push,
    Pull,
}

/// 覆盖本地前自动备份（exports/backup-*.fermata.json），返回备份路径
fn backup_local(conn: &Connection, app_dir: &std::path::Path) -> Result<String, String> {
    let dir = app_dir.join("exports");
    snapshot::backup_current(conn, &dir)
}

/// 覆盖远端前把远端当前快照塞进 backups/（首接冲突选推送时强制）
async fn backup_remote(cfg: &Cfg) -> Result<(), String> {
    if let Some(gz) = dav_get(cfg, "fermata/snapshot.json.gz").await? {
        let name = format!(
            "fermata/backups/remote-{}-{}.json.gz",
            chrono::Local::now().format("%Y%m%d-%H%M%S"),
            cfg.user.replace(['@', '.', '\\', '/'], "_")
        );
        dav_put(cfg, &name, gz).await?;
    }
    Ok(())
}

/// 主入口：同步一次。force 用于首接冲突的用户选方向。
/// with_conn：调用方提供的锁内执行器（持锁 → 跑闭包 → 放锁），网络等待全程不持锁。
pub async fn run(
    cfg: &Cfg,
    app_dir: &std::path::Path,
    with_conn: &(dyn Fn(&mut dyn FnMut(&Connection) -> Result<(), String>) -> Result<(), String> + Sync),
    force: Option<Force>,
) -> Result<Outcome, String> {
    // 读基线与脏标记
    let mut base = (0i64, false);
    with_conn(&mut |conn| {
        base = (base_rev(conn), dirty(conn)?);
        Ok(())
    })?;
    let (rev0, is_dirty) = base;

    let remote = fetch_meta(cfg).await?; // read-before-write
    let plan = match force {
        Some(_) => None,
        None => Some(decide(&remote, rev0, is_dirty)),
    };

    match (force, plan) {
        (Some(Force::Push), None) => {
            backup_remote(cfg).await?;
            let rev = remote.as_ref().map(|m| m.rev).unwrap_or(0) + 1;
            push_phase(cfg, with_conn, rev).await
        }
        (Some(Force::Pull), None) => {
            let meta = remote.ok_or("远端还没有快照")?;
            pull_apply(cfg, app_dir, with_conn, &meta, false).await
        }
        (None, Some(Plan::Noop)) => Ok(ok("noop", "已是最新", rev0)),
        (None, Some(Plan::PushInitial)) => push_phase(cfg, with_conn, 1).await,
        (None, Some(Plan::Push(rev))) => push_phase(cfg, with_conn, rev).await,
        (None, Some(Plan::PullFast)) => pull_apply(cfg, app_dir, with_conn, &remote.unwrap(), false).await,
        (None, Some(Plan::PullConflict)) => pull_apply(cfg, app_dir, with_conn, &remote.unwrap(), true).await,
        (None, Some(Plan::FirstConflict)) => Ok(ok(
            "first_conflict",
            "远端已有一份数据，本机也有未同步的修改；请选择推送或拉取（都会先备份被覆盖方）",
            rev0,
        )),
        _ => unreachable!(),
    }
}

/// 推：锁内出快照 → 网络 PUT（先快照后 meta）→ 锁内记基线
async fn push_phase(
    cfg: &Cfg,
    with_conn: &(dyn Fn(&mut dyn FnMut(&Connection) -> Result<(), String>) -> Result<(), String> + Sync),
    rev: i64,
) -> Result<Outcome, String> {
    let mut packed: Option<(Vec<u8>, Meta)> = None;
    with_conn(&mut |conn| {
        let gz = snapshot_gz(conn)?;
        packed = Some((
            gz,
            Meta { rev, device_id: device_id(conn)?, device_name: device_name(), generated_at: db::now_ms() },
        ));
        Ok(())
    })?;
    let (gz, meta) = packed.unwrap();
    ensure_dirs(cfg).await?;
    dav_put(cfg, "fermata/snapshot.json.gz", gz).await?;
    dav_put(cfg, "fermata/snapshot.meta.json", serde_json::to_vec(&meta).map_err(|e| e.to_string())?).await?;
    with_conn(&mut |conn| {
        sset(conn, "sync_base_rev", &rev.to_string())?;
        let em = event_max(conn)?;
        sset(conn, "sync_base_event_max", &em.to_string())
    })?;
    Ok(ok("pushed", format!("已推送 rev {rev}"), rev))
}

/// 拉：网络 GET → 锁内（备份本机 → 覆盖 → 记基线）
async fn pull_apply(
    cfg: &Cfg,
    app_dir: &std::path::Path,
    with_conn: &(dyn Fn(&mut dyn FnMut(&Connection) -> Result<(), String>) -> Result<(), String> + Sync),
    meta: &Meta,
    conflict: bool,
) -> Result<Outcome, String> {
    let Some(gz) = dav_get(cfg, "fermata/snapshot.json.gz").await? else {
        return Err("远端 meta 存在但快照缺失".into());
    };
    let raw = gunzip(&gz)?;
    let mut out: Option<Outcome> = None;
    with_conn(&mut |conn| {
        let backup = if conflict || dirty(conn)? {
            Some(backup_local(conn, app_dir)?)
        } else {
            None
        };
        apply_remote(conn, &raw)?;
        sset(conn, "sync_base_rev", &meta.rev.to_string())?;
        let em = event_max(conn)?;
        sset(conn, "sync_base_event_max", &em.to_string())?;
        let mut o = if conflict {
            ok("conflict_remote_won", "远端版本更新，已覆盖本机", meta.rev)
        } else {
            ok("pulled", "已拉取远端最新", meta.rev)
        };
        if let Some(p) = backup {
            o.detail = format!("{}（本机原数据已备份：{}）", o.detail, p);
        }
        out = Some(o);
        Ok(())
    })?;
    Ok(out.unwrap())
}

/// 连接配置写入（凭据进钥匙串/私有文件，URL 与用户名进 settings）
/// base_event_max 置 0：本机已有数据即视为未同步修改，首接走 FirstConflict 由用户选方向
pub fn connect(
    conn: &Connection,
    app_dir: &std::path::Path,
    url: &str,
    user: &str,
    secret_val: &str,
) -> Result<(), String> {
    secret::set(app_dir, secret_val)?;
    sset(conn, "sync_url", &norm_base(url))?;
    sset(conn, "sync_user", user)?;
    sset(conn, "sync_base_rev", "0")?;
    sset(conn, "sync_base_event_max", "0")?;
    Ok(())
}

pub fn disconnect(conn: &Connection, app_dir: &std::path::Path) -> Result<(), String> {
    secret::clear(app_dir)?;
    for k in ["sync_url", "sync_user", "sync_base_rev", "sync_base_event_max", "sync_last_at", "sync_last_result"] {
        conn.execute("DELETE FROM settings WHERE key = ?1", rusqlite::params![k]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 状态（设置页展示）
pub fn status(conn: &Connection) -> Value {
    let configured = configured(conn);
    json!({
        "configured": configured,
        "url": sget(conn, "sync_url"),
        "user": sget(conn, "sync_user"),
        "base_rev": base_rev(conn),
        "last_at": sget(conn, "sync_last_at").and_then(|s| s.parse::<i64>().ok()),
        "last_result": sget(conn, "sync_last_result"),
        "device_name": device_name(),
        "device_id": sget(conn, "device_id"),
    })
}

pub fn record_result(conn: &Connection, o: &Outcome) -> Result<(), String> {
    sset(conn, "sync_last_at", &db::now_ms().to_string())?;
    sset(conn, "sync_last_result", &format!("{}: {}", o.status, o.detail))?;
    Ok(())
}

// ---------- 测试 ----------

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(rev: i64) -> Option<Meta> {
        Some(Meta { rev, device_id: "d".into(), device_name: "n".into(), generated_at: 0 })
    }

    #[test]
    fn decide_matrix() {
        assert_eq!(decide(&None, 0, false), Plan::PushInitial);
        assert_eq!(decide(&meta(3), 3, false), Plan::Noop);
        assert_eq!(decide(&meta(3), 3, true), Plan::Push(4));
        assert_eq!(decide(&meta(5), 3, false), Plan::PullFast);
        assert_eq!(decide(&meta(5), 3, true), Plan::PullConflict);
        assert_eq!(decide(&meta(5), 0, true), Plan::FirstConflict);
        assert_eq!(decide(&meta(5), 0, false), Plan::PullFast);
    }

    #[test]
    fn apply_remote_keeps_local_keys() {
        let mut conn = crate::db::open_in_memory().unwrap();
        // 本机：外观 + sync 状态 + 一个计时参数
        crate::db::ops::setting_set(&conn, 1, "theme", "dark").unwrap();
        crate::db::open_in_memory().unwrap();
        sset(&conn, "sync_url", "http://x/").unwrap();
        sset(&conn, "slice_minutes", "45").unwrap();
        // 远端快照：计时参数不同
        let remote_db = crate::db::open_in_memory().unwrap();
        sset(&remote_db, "slice_minutes", "60").unwrap();
        sset(&remote_db, "theme", "light").unwrap();
        let v = snapshot::build_snapshot(&remote_db).unwrap();
        let raw = serde_json::to_vec(&v).unwrap();
        apply_remote(&conn, &raw).unwrap();
        assert_eq!(sget(&conn, "slice_minutes").unwrap(), "60"); // 计时参数随远端
        assert_eq!(sget(&conn, "theme").unwrap(), "dark"); // 外观留本机
        assert_eq!(sget(&conn, "sync_url").unwrap(), "http://x/"); // sync 状态留本机
        conn.execute_batch("").unwrap();
    }
}
