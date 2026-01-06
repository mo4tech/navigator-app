package io.fleetbase.navigator

import android.os.Bundle
import androidx.annotation.NonNull
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.zoontek.rnbootsplash.RNBootSplash
import io.wazo.callkeep.RNCallKeepModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "BotitFleet"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flag [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
          DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /** Handle application instance creation. */
  override fun onCreate(savedInstanceState: Bundle?) {
    RNBootSplash.init(this, R.style.BootTheme)
    super.onCreate(savedInstanceState)
  }

  // Permission results for CallKeep
  override fun onRequestPermissionsResult(
    requestCode: Int,
    @NonNull permissions: Array<String>,
    @NonNull grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    when (requestCode) {
      RNCallKeepModule.REQUEST_READ_PHONE_STATE ->
        RNCallKeepModule.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }
  }
}
