package com.fermata.app.keeper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class KeeperReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    Log.i("FermataKeeper", "onReceive " + intent.action)
    when (intent.action) {
      Keeper.ACT_PAUSE -> {
        Keeper.flipPaused(ctx, true)
        KeeperPlugin.current?.dispatchAction("pause")
      }
      Keeper.ACT_RESUME -> {
        Keeper.flipPaused(ctx, false)
        KeeperPlugin.current?.dispatchAction("resume")
      }
      Keeper.ACT_ALARM -> Keeper.fireReminder(ctx)
    }
  }
}
