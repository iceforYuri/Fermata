package com.fermata.app.keeper

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log

/**
 * 会话通知（M2m）：内容由 JS 端真实计时状态驱动（showSession）。
 * 通知按钮 → KeeperReceiver 即时翻转本地视觉 + dispatchAction 事件回 JS → 真实暂停/继续。
 * 闹钟 = 休止符到点提醒（Q12：一次、不循环、不拉起）。
 */
object Keeper {
  private const val TAG = "FermataKeeper"
  private const val PREFS = "fermata_keeper"
  private const val CH_SESSION = "fermata_session"
  private const val CH_REMIND = "fermata_remind"
  private const val NOTIF_SESSION = 1
  private const val NOTIF_REMIND = 2
  const val ACT_PAUSE = "com.fermata.app.keeper.PAUSE"
  const val ACT_RESUME = "com.fermata.app.keeper.RESUME"
  const val ACT_ALARM = "com.fermata.app.keeper.ALARM"

  fun ensureChannels(ctx: Context) {
    val nm = ctx.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CH_SESSION, "会话", NotificationManager.IMPORTANCE_LOW))
    nm.createNotificationChannel(NotificationChannel(CH_REMIND, "休止符提醒", NotificationManager.IMPORTANCE_HIGH))
  }

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun showSession(ctx: Context, title: String, running: Boolean, whenEpoch: Long, accumMs: Long) {
    prefs(ctx).edit()
      .putString("title", title)
      .putBoolean("running", running)
      .putLong("whenEpoch", whenEpoch)
      .putLong("accumMs", accumMs)
      .apply()
    render(ctx, title, running, whenEpoch, accumMs)
  }

  fun hideSession(ctx: Context) {
    ctx.getSystemService(NotificationManager::class.java).cancel(NOTIF_SESSION)
  }

  /** 接收器按下按钮时的即时视觉翻转（真实暂停/继续由 JS→Rust 落定后再由 showSession 覆盖） */
  fun flipPaused(ctx: Context, paused: Boolean) {
    val p = prefs(ctx)
    val title = p.getString("title", "") ?: ""
    val whenEpoch = p.getLong("whenEpoch", 0L)
    var accum = p.getLong("accumMs", 0L)
    if (paused && p.getBoolean("running", false)) {
      accum += System.currentTimeMillis() - whenEpoch
    }
    val newRunning = !paused
    val newWhen = if (newRunning) System.currentTimeMillis() else whenEpoch
    p.edit().putBoolean("running", newRunning).putLong("accumMs", accum).putLong("whenEpoch", newWhen).apply()
    render(ctx, title, newRunning, newWhen, accum)
  }

  private fun render(ctx: Context, title: String, running: Boolean, whenEpoch: Long, accumMs: Long) {
    ensureChannels(ctx)
    val nm = ctx.getSystemService(NotificationManager::class.java)
    val openApp = PendingIntent.getActivity(
      ctx, 0,
      Intent(ctx, Class.forName("com.fermata.app.MainActivity")),
      PendingIntent.FLAG_IMMUTABLE
    )
    val b = Notification.Builder(ctx, CH_SESSION)
      .setContentTitle(title)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openApp)
    if (running) {
      b.setContentText("计时中")
      b.setWhen(whenEpoch).setUsesChronometer(true)
      b.addAction(action(ctx, ACT_PAUSE, "暂停", 1))
    } else {
      b.setContentText("已暂停 · 累计 " + (accumMs / 1000) + "s")
      b.setUsesChronometer(false)
      b.addAction(action(ctx, ACT_RESUME, "继续", 2))
    }
    nm.notify(NOTIF_SESSION, b.build())
  }

  private fun action(ctx: Context, act: String, label: String, req: Int): Notification.Action {
    val pi = PendingIntent.getBroadcast(ctx, req, Intent(ctx, KeeperReceiver::class.java).setAction(act), PendingIntent.FLAG_IMMUTABLE)
    return Notification.Action.Builder(null, label, pi).build()
  }

  /** 休止符到点提醒（绝对时刻，elapsedRealtime 基准）。Android 14+ 精确闹钟默认不授予 → 检查+降级。 */
  fun scheduleIn(ctx: Context, inMs: Long) {
    scheduleAtElapsed(ctx, SystemClock.elapsedRealtime() + inMs)
  }

  fun scheduleAtElapsed(ctx: Context, atElapsedMs: Long) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    val pi = PendingIntent.getBroadcast(ctx, 3, Intent(ctx, KeeperReceiver::class.java).setAction(ACT_ALARM), PendingIntent.FLAG_IMMUTABLE)
    try {
      if (am.canScheduleExactAlarms()) {
        am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, atElapsedMs, pi)
        Log.i(TAG, "reminder scheduled exact")
      } else {
        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, atElapsedMs, pi)
        Log.w(TAG, "exact alarm 未授权，回退不精确")
      }
    } catch (se: SecurityException) {
      Log.e(TAG, "alarm denied", se)
    }
  }

  fun cancelAlarm(ctx: Context) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    am.cancel(PendingIntent.getBroadcast(ctx, 3, Intent(ctx, KeeperReceiver::class.java).setAction(ACT_ALARM), PendingIntent.FLAG_IMMUTABLE))
  }

  fun fireReminder(ctx: Context) {
    Log.i(TAG, "reminder fired")
    ensureChannels(ctx)
    val nm = ctx.getSystemService(NotificationManager::class.java)
    val tap = PendingIntent.getActivity(ctx, 0, Intent(ctx, Class.forName("com.fermata.app.MainActivity")), PendingIntent.FLAG_IMMUTABLE)
    val n = Notification.Builder(ctx, CH_REMIND)
      .setContentTitle("休止符到点")
      .setContentText("到点提醒一次，不循环。回应用后再决定去留。")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    nm.notify(NOTIF_REMIND, n)
  }
}
