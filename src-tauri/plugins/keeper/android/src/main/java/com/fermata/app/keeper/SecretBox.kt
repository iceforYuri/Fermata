package com.fermata.app.keeper

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

/** 同步凭据的 Keystore 封装（docs/07 §5：凭据 = Android Keystore）。
 *  AES/GCM 密钥只存在 Keystore 里；密文（iv‖ct，Base64）落应用私有目录 sync.secret。
 *  密钥失效（换锁屏方式等）→ 解密失败即清除密文并返回 null，用户需重新连接。 */
object SecretBox {
  private const val ALIAS = "fermata_sync"
  private const val FILE = "sync.secret"

  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun key(): javax.crypto.SecretKey {
    val ks = keyStore()
    (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = javax.crypto.KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return gen.generateKey()
  }

  fun set(ctx: Context, plain: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    val packed = cipher.iv + ct
    ctx.openFileOutput(FILE, Context.MODE_PRIVATE).use { it.write(Base64.encodeToString(packed, Base64.NO_WRAP).toByteArray()) }
  }

  fun get(ctx: Context): String? {
    val f = ctx.getFileStreamPath(FILE)
    if (!f.exists()) return null
    return try {
      val packed = Base64.decode(f.readBytes(), Base64.NO_WRAP)
      val iv = packed.copyOfRange(0, 12)
      val ct = packed.copyOfRange(12, packed.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      String(cipher.doFinal(ct), Charsets.UTF_8)
    } catch (e: Exception) {
      // 密钥失效/密文损坏：清掉，要求重新连接
      clear(ctx)
      null
    }
  }

  fun clear(ctx: Context) {
    ctx.getFileStreamPath(FILE).delete()
  }
}
