//! 数据存储位置：指针文件 + 切换（复制迁移 / 接续已有库）。
//! 解析优先级：FERMATA_DB_PATH（兼容 GIKA_DB_PATH）环境变量 > 指针文件（app_data_dir/db-location.txt）> 默认 app_data_dir/fermata.db。
//! 指针文件只存一行路径（数据库里不能存"数据库在哪"——先有鸡问题）。

use std::path::{Path, PathBuf};

use rusqlite::Connection;

pub const POINTER_FILE: &str = "db-location.txt";
pub const DB_FILE: &str = "fermata.db";

pub fn pointer_path(app_dir: &Path) -> PathBuf {
    app_dir.join(POINTER_FILE)
}

/// 启动解析：env > 指针 > 默认
pub fn resolve(app_dir: &Path) -> PathBuf {
    if let Ok(p) = std::env::var("FERMATA_DB_PATH").or_else(|_| std::env::var("GIKA_DB_PATH")) {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    if let Ok(s) = std::fs::read_to_string(pointer_path(app_dir)) {
        let s = s.trim();
        if !s.is_empty() && Path::new(s).exists() {
            return PathBuf::from(s);
        }
    }
    app_dir.join(DB_FILE)
}

/// 切换存储位置。目标目录已有 fermata.db → 接续（不覆盖，原样切换）；
/// 没有 → 先把 WAL 折进主文件再整文件复制（旧库原地保留，回滚零成本）。
/// 返回 (新库路径, 是否接续已有库)。只写文件不碰连接，连接切换由调用方做。
pub fn switch(
    conn: &Connection,
    current_db: &Path,
    app_dir: &Path,
    target_dir: &Path,
) -> Result<(PathBuf, bool), String> {
    std::fs::create_dir_all(target_dir).map_err(|e| format!("创建目标目录失败: {e}"))?;
    let target_db = target_dir.join(DB_FILE);
    if target_db == current_db {
        return Err("目标位置与当前相同".into());
    }
    let adopted = target_db.exists();
    if !adopted {
        // WAL 折进主文件，保证单文件拷贝完整
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| format!("WAL 归档失败: {e}"))?;
        std::fs::copy(current_db, &target_db).map_err(|e| format!("复制数据库失败: {e}"))?;
    }
    std::fs::write(pointer_path(app_dir), target_db.to_string_lossy().as_bytes())
        .map_err(|e| format!("写指针文件失败: {e}"))?;
    Ok((target_db, adopted))
}

/// 清除指针（回默认）：删指针文件即可
pub fn reset(app_dir: &Path) -> Result<PathBuf, String> {
    let ptr = pointer_path(app_dir);
    if ptr.exists() {
        std::fs::remove_file(&ptr).map_err(|e| format!("删除指针文件失败: {e}"))?;
    }
    Ok(app_dir.join(DB_FILE))
}
