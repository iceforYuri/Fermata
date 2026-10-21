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
class SecretArgs {
  var value: String = ""
}

@InvokeArg
class ScheduleArgs {
  var inMs: Long = 0  // 从现在起的相对毫秒
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
    maybeRequestNotificationPermission()
    val args = invoke.parseArgs(UpdateArgs::class.java)
    Keeper.showSession(activity, args.title, args.running, args.whenEpoch, args.accumMs)
    invoke.resolve()
  }

  @Command
  fun hide(invoke: Invoke) {
    Keeper.hideSession(activity)
    invoke.resolve()
  }

  @Command
  fun scheduleReminder(invoke: Invoke) {
    val args = invoke.parseArgs(ScheduleArgs::class.java)
    Keeper.scheduleIn(activity, args.inMs)
    invoke.resolve()
  }

  @Command
  fun cancelReminder(invoke: Invoke) {
    Keeper.cancelAlarm(activity)
    invoke.resolve()
  }

  @Command
  fun setSecret(invoke: Invoke) {
    val args = invoke.parseArgs(SecretArgs::class.java)
    SecretBox.set(activity, args.value)
    invoke.resolve()
  }

  @Command
  fun getSecret(invoke: Invoke) {
    invoke.resolve(JSObject().put("value", SecretBox.get(activity)))
  }

  @Command
  fun clearSecret(invoke: Invoke) {
    SecretBox.clear(activity)
    invoke.resolve()
  }

  private fun maybeRequestNotificationPermission() {
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      val nm = activity.getSystemService(android.app.NotificationManager::class.java)
      if (!nm.areNotificationsEnabled()) {
        androidx.core.app.ActivityCompat.requestPermissions(
          activity, arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 71
        )
      }
    }
  }

  fun dispatchAction(action: String) {
    trigger("keeper-action", JSObject().put("action", action))
  }
}
