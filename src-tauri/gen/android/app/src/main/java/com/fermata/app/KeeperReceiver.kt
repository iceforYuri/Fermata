package com.fermata.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class KeeperReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    Log.i("FermataKeeper", "onReceive action=" + intent.action)
    when (intent.action) {
      Keeper.ACTION_PAUSE -> Keeper.pause(ctx)
      Keeper.ACTION_RESUME -> Keeper.resume(ctx)
      Keeper.ACTION_ALARM -> Keeper.fireReminder(ctx)
    }
  }
}
