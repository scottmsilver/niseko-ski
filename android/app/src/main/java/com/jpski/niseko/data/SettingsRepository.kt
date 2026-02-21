package com.jpski.niseko.data

import android.content.Context
import com.jpski.niseko.ui.theme.NisekoThemeOption

class SettingsRepository(context: Context) {
    private val prefs = context.getSharedPreferences("niseko_settings", Context.MODE_PRIVATE)

    private var _themeName: String = prefs.getString("theme", NisekoThemeOption.LIGHT.name) ?: NisekoThemeOption.LIGHT.name
    private var _fontScale: Float = prefs.getFloat("font_scale", 1f)

    var themeName: String
        get() = _themeName
        set(value) {
            _themeName = value
            prefs.edit().putString("theme", value).apply()
        }

    var fontScale: Float
        get() = _fontScale
        set(value) {
            _fontScale = value
            prefs.edit().putFloat("font_scale", value).apply()
        }
}
