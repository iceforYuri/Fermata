//! M4m 手动验证：双模拟设备对 wsgidav（http://127.0.0.1:8877，匿名）的推拉全流程。
//! 跑法：先起 wsgidav（见 docs/mobile-poc-log.md），再 cargo run --bin verify_sync。
//! 覆盖：首推 → 对端首拉 → 对端改后推 → 本端快进拉 → 双端同改冲突（远端赢 + 本机备份）→ 运行锁读写 → 首接冲突选方向。

use fermata_lib::db::{self, ops};
use fermata_lib::sync::{self, Cfg, Force};
use rusqlite::Connection;
use std::sync::Mutex;

struct Dev(Mutex<Connection>);

impl Dev {
    fn open(dir: &std::path::Path, device: &str) -> Dev {
        let conn = db::open(&dir.join("fermata.db")).expect("open db");
        conn.execute("UPDATE settings SET value = ?1 WHERE key = 'device_id'", rusqlite::params![device])
            .expect("set device_id");
        Dev(Mutex::new(conn))
    }
    fn q<T>(&self, f: impl FnOnce(&Connection) -> T) -> T {
        let c = self.0.lock().unwrap();
        f(&c)
    }
    fn runner(&self) -> impl Fn(&mut dyn FnMut(&Connection) -> Result<(), String>) -> Result<(), String> + Sync + '_ {
        move |f| {
            let c = self.0.lock().map_err(|e| e.to_string())?;
            f(&c)
        }
    }
}

fn cfg() -> Cfg {
    Cfg { base: "http://127.0.0.1:8877/".into(), user: String::new(), secret: String::new() }
}

fn count(dev: &Dev, sql: &str) -> i64 {
    dev.q(|c| c.query_row(sql, [], |r| r.get(0)).unwrap())
}

fn main() -> Result<(), String> {
    tauri::async_runtime::block_on(run())
}

async fn run() -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!("fermata-sync-test-{}", db::now_ms()));
    for d in ["a", "b", "c"] {
        std::fs::create_dir_all(tmp.join(d)).map_err(|e| e.to_string())?;
    }
    let cfg = cfg();
    let _ = sync::lock_sync(&cfg, None, "devA").await;
    let _ = sync::lock_sync(&cfg, None, "devB").await;

    // --- A：建一个进程，首推 rev1 ---
    let a = Dev::open(&tmp.join("a"), "devA");
    a.q(|c| ops::process_create(c, db::now_ms(), "alpha", None, None))?;
    let out = sync::run(&cfg, &tmp.join("a"), &a.runner(), None).await?;
    println!("[A 首推] {} rev={} {}", out.status, out.rev, out.detail);
    assert_eq!(out.status, "pushed");
    assert_eq!(out.rev, 1);

    // --- B：空库首拉 ---
    let b = Dev::open(&tmp.join("b"), "devB");
    let out = sync::run(&cfg, &tmp.join("b"), &b.runner(), None).await?;
    println!("[B 首拉] {} rev={} {}", out.status, out.rev, out.detail);
    assert_eq!(out.status, "pulled");
    assert_eq!(count(&b, "SELECT COUNT(*) FROM processes WHERE title = 'alpha'"), 1, "B 应有 alpha");

    // --- B 加一条计划并推 rev2 ---
    b.q(|c| ops::plan_create(c, db::now_ms(), "beta-plan", Some(30), None))?;
    let out = sync::run(&cfg, &tmp.join("b"), &b.runner(), None).await?;
    println!("[B 推] {} rev={}", out.status, out.rev);
    assert_eq!(out.status, "pushed");
    assert_eq!(out.rev, 2);

    // --- A 无本地改动：快进拉到 rev2 ---
    let out = sync::run(&cfg, &tmp.join("a"), &a.runner(), None).await?;
    println!("[A 拉] {} rev={}", out.status, out.rev);
    assert_eq!(out.status, "pulled");
    assert_eq!(count(&a, "SELECT COUNT(*) FROM plans WHERE title = 'beta-plan'"), 1, "A 应有 beta-plan");

    // --- 再同步一次：无变化 noop ---
    let out = sync::run(&cfg, &tmp.join("a"), &a.runner(), None).await?;
    println!("[A 再同步] {}", out.status);
    assert_eq!(out.status, "noop");

    // --- 冲突：A 改（不推），B 改并推 rev3，A 再同步 → 远端赢 + 本机自动备份 ---
    a.q(|c| ops::process_create(c, db::now_ms(), "a-local-only", None, None))?;
    b.q(|c| ops::plan_create(c, db::now_ms(), "b-wins", Some(15), None))?;
    let out = sync::run(&cfg, &tmp.join("b"), &b.runner(), None).await?;
    assert_eq!(out.status, "pushed");
    assert_eq!(out.rev, 3);
    let out = sync::run(&cfg, &tmp.join("a"), &a.runner(), None).await?;
    println!("[A 冲突] {} rev={} {}", out.status, out.rev, out.detail);
    assert_eq!(out.status, "conflict_remote_won");
    assert_eq!(count(&a, "SELECT COUNT(*) FROM processes WHERE title = 'a-local-only'"), 0, "A 本地改动被远端覆盖");
    let backups = std::fs::read_dir(tmp.join("a").join("exports")).map_err(|e| e.to_string())?;
    assert!(backups.count() >= 1, "A 应有自动备份");
    assert_eq!(count(&a, "SELECT COUNT(*) FROM plans WHERE title = 'b-wins'"), 1, "A 应拿到 b-wins");

    // --- 运行锁：B 开始进程 → 锁写入；A 读到；清除后为空 ---
    let pid: i64 = b.q(|c| c.query_row("SELECT id FROM processes WHERE title = 'alpha'", [], |r| r.get(0)).unwrap());
    b.q(|c| ops::process_switch(c, db::now_ms(), pid, None))?;
    let lock = sync::lock_current(&b.0.lock().unwrap())?;
    assert!(lock.is_some(), "B 有运行进程应有锁草稿");
    sync::lock_sync(&cfg, lock.as_ref(), "devB").await?;
    let others = sync::lock_read_others(&cfg, "devA").await?;
    assert_eq!(others.len(), 1);
    assert_eq!(others[0].device_id, "devB");
    assert!(others[0].fresh(db::now_ms()), "锁应新鲜");
    println!("[锁] A 看到 B 在跑「{}」（{}）", others[0].process_title, others[0].device_name);
    sync::lock_sync(&cfg, None, "devB").await?;
    assert!(sync::lock_read_others(&cfg, "devA").await?.is_empty(), "锁清除后应为空");

    // --- 首接冲突：C 是全新第三设备且有本地数据 → first_conflict → 选 push（远端先备份）---
    let c = Dev::open(&tmp.join("c"), "devC");
    c.q(|x| ops::process_create(x, db::now_ms(), "c-local", None, None))?;
    let out = sync::run(&cfg, &tmp.join("c"), &c.runner(), None).await?;
    println!("[C 首接] {} {}", out.status, out.detail);
    assert_eq!(out.status, "first_conflict");
    let out = sync::run(&cfg, &tmp.join("c"), &c.runner(), Some(Force::Push)).await?;
    println!("[C 选推送] {} rev={}（远端已备份进 backups/）", out.status, out.rev);
    assert_eq!(out.status, "pushed");
    assert_eq!(out.rev, 4, "强制推送应接在远端 rev3 之后");
    // A 基线 rev3 且本地未改 → 快进拉到 rev4，拿到 c-local
    let out = sync::run(&cfg, &tmp.join("a"), &a.runner(), None).await?;
    println!("[A 拉 rev4] {}", out.status);
    assert_eq!(out.status, "pulled");
    assert_eq!(count(&a, "SELECT COUNT(*) FROM processes WHERE title = 'c-local'"), 1, "A 应拿到 c-local");
    println!("\n== 全部通过 ==");
    Ok(())
}
