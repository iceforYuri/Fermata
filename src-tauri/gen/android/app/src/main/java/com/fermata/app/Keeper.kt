package com.fermata.app

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
 * PoC 门 2/3：时间戳记账 + Chronometer 常驻通知 + AlarmManager 到点提醒。
 * 无常驻服务：计时靠持久化时间戳推算，进程被杀不丢。
 */
object Keeper {
  private const val TAG = "FermataKeeper"
  private const val PREFS = "fermata_keeper"
  private const val CH_SESSION = "fermata_session"   // 会话通知：低打扰
  private const val CH_REMIND = "fermata_remind"     // 休止符提醒：高优先
  private const val NOTIF_SESSION = 1
  private const val NOTIF_REMIND = 2
  const val ACTION_PAUSE = "com.fermata.app.KEEPER_PAUSE"
  const val ACTION_RESUME = "com.fermata.app.KEEPER_RESUME"
  const val ACTION_ALARM = "com.fermata.app.KEEPER_ALARM"

  fun ensureChannels(ctx: Context) {
    val nm = ctx.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CH_SESSION, "会话", NotificationManager.IMPORTANCE_LOW))
    nm.createNotificationChannel(NotificationChannel(CH_REMIND, "休止符提醒", NotificationManager.IMPORTANCE_HIGH))
  }

  fun isRunning(ctx: Context) = prefs(ctx).getBoolean("running", false)
  private fun startEpoch(ctx: Context) = prefs(ctx).getLong("startEpoch", 0L)
  private fun accum(ctx: Context) = prefs(ctx).getLong("accum", 0L)
  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun elapsedMs(ctx: Context): Long {
    val base = accum(ctx)
    return if (isRunning(ctx)) base + (System.currentTimeMillis() - startEpoch(ctx)) else base
  }

  fun start(ctx: Context) {
    prefs(ctx).edit().putBoolean("running", true).putLong("startEpoch", System.currentTimeMillis()).putLong("accum", 0L).apply()
    Log.i(TAG, "session start")
    notifySession(ctx)
    scheduleAlarm(ctx, 2 * 60 * 1000L) // PoC：2 分钟后模拟休止符到点
  }

  fun pause(ctx: Context) {
    if (!isRunning(ctx)) return
    val acc = accum(ctx) + (System.currentTimeMillis() - startEpoch(ctx))
    prefs(ctx).edit().putBoolean("running", false).putLong("accum", acc).apply()
    Log.i(TAG, "pause, accum=" + acc + "ms")
    cancelAlarm(ctx)
    notifySession(ctx)
  }

  fun resume(ctx: Context) {
    if (isRunning(ctx)) return
    prefs(ctx).edit().putBoolean("running", true).putLong("startEpoch", System.currentTimeMillis()).apply()
    Log.i(TAG, "resume")
    notifySession(ctx)
  }

  fun fireReminder(ctx: Context) {
    Log.i(TAG, "reminder fired, elapsed=" + elapsedMs(ctx) + "ms")
    val nm = ctx.getSystemService(NotificationManager::class.java)
    val tap = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val n = Notification.Builder(ctx, CH_REMIND)
      .setContentTitle("休止符到点（PoC）")
      .setContentText("已专注 " + (elapsedMs(ctx) / 1000) + "s —— 到点提醒一次，不循环")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    nm.notify(NOTIF_REMIND, n)
  }

  fun notifySession(ctx: Context) {
    ensureChannels(ctx)
    val nm = ctx.getSystemService(NotificationManager::class.java)
    val b = Notification.Builder(ctx, CH_SESSION)
      .setContentTitle("PoC 计时会话")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
    if (isRunning(ctx)) {
      b.setContentText("计时中 · 点按管理")
      b.setWhen(startEpoch(ctx)).setUsesChronometer(true)  // 系统自渲染读秒
      b.addAction(action(ctx, ACTION_PAUSE, "暂停", 1))
    } else {
      b.setContentText("已暂停 · 累计 " + (accum(ctx) / 1000) + "s")
      b.setUsesChronometer(false)
      b.addAction(action(ctx, ACTION_RESUME, "继续", 2))
    }
    nm.notify(NOTIF_SESSION, b.build())
  }

  private fun action(ctx: Context, act: String, label: String, req: Int): Notification.Action {
    val pi = PendingIntent.getBroadcast(ctx, req, Intent(ctx, KeeperReceiver::class.java).setAction(act), PendingIntent.FLAG_IMMUTABLE)
    return Notification.Action.Builder(null, label, pi).build()
  }

  fun scheduleAlarm(ctx: Context, delayMs: Long) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    val pi = PendingIntent.getBroadcast(ctx, 3, Intent(ctx, KeeperReceiver::class.java).setAction(ACTION_ALARM), PendingIntent.FLAG_IMMUTABLE)
    val triggerAt = SystemClock.elapsedRealtime() + delayMs
    try {
      if (am.canScheduleExactAlarms()) {
        am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
        Log.i(TAG, "alarm scheduled exact +" + delayMs + "ms")
      } else {
        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
        Log.w(TAG, "exact alarm 未授权，回退不精确闹钟 +" + delayMs + "ms")
      }
    } catch (se: SecurityException) {
      Log.e(TAG, "alarm schedule denied", se)
    }
  }

  fun cancelAlarm(ctx: Context) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    am.cancel(PendingIntent.getBroadcast(ctx, 3, Intent(ctx, KeeperReceiver::class.java).setAction(ACTION_ALARM), PendingIntent.FLAG_IMMUTABLE))
  }
}
