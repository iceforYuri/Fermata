package com.fermata.app.keeper

import android.app.Activity
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class UpdateArgs {
  var title: String = ""
  var running: Boolean = false
  var whenEpoch: Long = 0
  var accumMs: Long = 0
}

@InvokeArg
class ScheduleArgs {
  var atElapsed: Long = 0  // SystemClock.elapsedRealtime() 基准的时刻
}

/** 会话通知桥：JS 驱动通知内容；通知按钮经 keeper-action 事件回 JS。 */
@TauriPlugin
class KeeperPlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    var current: KeeperPlugin? = null
  }

  override fun load(webView: android.webkit.WebView) {
    current = this
    Keeper.ensureChannels(activity)
    Log.i("FermataKeeper", "plugin loaded")
  }

  @Command
  fun update(invoke: Invoke) {
    val args = invoke.parseArgs(UpdateArgs::class.java)
    Keeper.showSession(activity, args.title, args.running, args.whenEpoch, args.accumMs)
    invoke.resolve()
  }

  @Command
  fun scheduleReminder(invoke: Invoke) {
    val args = invoke.parseArgs(ScheduleArgs::class.java)
    Keeper.scheduleAtElapsed(activity, args.atElapsed)
    invoke.resolve()
  }

  @Command
  fun cancelReminder(invoke: Invoke) {
    Keeper.cancelAlarm(activity)
    invoke.resolve()
  }

  fun dispatchAction(action: String) {
    trigger("keeper-action", JSObject().put("action", action))
  }
}
