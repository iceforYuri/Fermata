package com.fermata.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // PoC 门 2/3 接线：启动即开一段计时会话（正式接线在 M2m：有运行进程才发会话通知）
    Keeper.ensureChannels(this)
    if (!Keeper.isRunning(this)) {
      Keeper.start(this)
    } else {
      Keeper.notifySession(this)
    }
  }
}
