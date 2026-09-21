//! 全量快照（*.fermata.json）：导出 / 校验 / 导入 / 备份。
//! 行级通用读写（SELECT * → JSON 对象，INSERT 显式列名回写）——保 id、保 REAL 分数位；
//! 导入在同一连接的事务内清表+插入（比换文件稳，连接不断；校验失败零副作用）。

use std::path::Path;

use rusqlite::{types::ValueRef, Connection};
use serde_json::{json, Map, Value};

use super::now_ms;

pub const FORMAT_VERSION: i64 = 1;
/// 快照覆盖的表（事件日志全量——统计的粮食）
const TABLES: &[&str] = &["processes", "plans", "steps", "segments", "events", "settings", "palette"];

fn read_table(conn: &Connection, table: &str) -> Result<Value, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {table}"))
        .map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = Vec::new();
    let mut it = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = it.next().map_err(|e| e.to_string())? {
        let mut obj = Map::new();
        for (i, name) in names.iter().enumerate() {
            let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(n) => json!(n),
                ValueRef::Real(f) => json!(f),
                ValueRef::Text(s) => Value::String(String::from_utf8_lossy(s).into_owned()),
                ValueRef::Blob(_) => return Err(format!("表 {table} 含 BLOB，快照不支持")),
            };
            obj.insert(name.clone(), v);
        }
        rows.push(Value::Object(obj));
    }
    Ok(Value::Array(rows))
}

/// 读全库 → 快照 JSON
pub fn build_snapshot(conn: &Connection) -> Result<Value, String> {
    let mut root = Map::new();
    root.insert(
        "meta".into(),
        json!({
            "format_version": FORMAT_VERSION,
            "exported_at": now_ms(),
            "app_version": env!("CARGO_PKG_VERSION"),
        }),
    );
    for t in TABLES {
        root.insert((*t).into(), read_table(conn, t)?);
    }
    Ok(Value::Object(root))
}

/// 结构校验（不碰库）：对象 + meta.format_version 匹配 + 各表为数组
pub fn validate_snapshot(v: &Value) -> Result<(), String> {
    let obj = v.as_object().ok_or("不是合法的 Fermata 快照（顶层不是对象）")?;
    let meta = obj
        .get("meta")
        .and_then(|m| m.as_object())
        .ok_or("不是合法的 Fermata 快照（缺 meta）")?;
    let fv = meta
        .get("format_version")
        .and_then(|x| x.as_i64())
        .ok_or("不是合法的 Fermata 快照（缺 format_version）")?;
    if fv != FORMAT_VERSION {
        return Err(format!("快照版本 {fv} 不受支持（当前支持 {FORMAT_VERSION}）"));
    }
    for t in TABLES {
        match obj.get(*t) {
            Some(Value::Array(_)) => {}
            _ => return Err(format!("快照缺「{t}」或结构不符")),
        }
    }
    Ok(())
}

/// 摘要（确认覆盖层展示用）：进程数 / 事件数 / 导出时间
pub fn summarize(v: &Value) -> Value {
    let len = |t: &str| v.get(t).and_then(|x| x.as_array()).map(|a| a.len()).unwrap_or(0);
    let exported_at = v
        .get("meta")
        .and_then(|m| m.get("exported_at"))
        .and_then(|x| x.as_i64());
    json!({
        "processes": len("processes"),
        "events": len("events"),
        "exported_at": exported_at,
    })
}

fn to_sql(v: &Value) -> Result<rusqlite::types::Value, String> {
    Ok(match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else {
                rusqlite::types::Value::Real(n.as_f64().ok_or("数值溢出")?)
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        other => return Err(format!("不支持的字段值类型: {other}")),
    })
}

fn insert_row(tx: &Connection, table: &str, obj: &Map<String, Value>) -> Result<(), String> {
    let cols: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({})",
        cols.join(", "),
        cols.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(", ")
    );
    let params: Vec<rusqlite::types::Value> = cols.iter().map(|c| to_sql(&obj[*c])).collect::<Result<_, _>>()?;
    tx.execute(&sql, rusqlite::params_from_iter(params))
        .map_err(|e| format!("写表 {table} 失败: {e}"))?;
    Ok(())
}

/// 事务内清表 + 插入快照（校验已在其中；任一失败整体回滚）。
/// 外键约束下删除必须子表先行（steps/segments → processes），插入反之。
pub fn import_snapshot(conn: &Connection, v: &Value) -> Result<(), String> {
    validate_snapshot(v)?;
    const DELETE_ORDER: &[&str] = &["steps", "segments", "events", "processes", "plans", "settings", "palette"];
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for t in DELETE_ORDER {
        tx.execute(&format!("DELETE FROM {t}"), []).map_err(|e| e.to_string())?;
    }
    for t in TABLES {
        let rows = v.get(*t).and_then(|x| x.as_array()).expect("校验已过");
        for r in rows {
            let obj = r.as_object().ok_or_else(|| format!("表 {t} 行结构不符"))?;
            insert_row(&tx, t, obj)?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 读文件 + 解析 + 校验（不碰库）
pub fn read_snapshot_file(path: &Path) -> Result<Value, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("读文件失败: {e}"))?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| format!("不是合法 JSON: {e}"))?;
    validate_snapshot(&v)?;
    Ok(v)
}

/// 写快照到指定路径
pub fn write_snapshot_file(conn: &Connection, path: &Path) -> Result<String, String> {
    let v = build_snapshot(conn)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// 备份当前库到 exports/backup-YYYYMMDD-HHmm.fermata.json，返回路径
pub fn backup_current(conn: &Connection, exports_dir: &Path) -> Result<String, String> {
    let now = chrono::Local::now();
    let path = exports_dir.join(format!(
        "backup-{}-{:02}{:02}.fermata.json",
        now.format("%Y%m%d"),
        now.format("%H"),
        now.format("%M")
    ));
    write_snapshot_file(conn, &path)
}
