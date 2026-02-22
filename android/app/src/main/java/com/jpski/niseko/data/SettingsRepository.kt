package com.jpski.niseko.data

import android.content.Context
import com.jpski.niseko.ui.theme.SkiThemeOption

class SettingsRepository(context: Context) {
    private val prefs = context.getSharedPreferences("ski_settings", Context.MODE_PRIVATE)

    private var _themeName: String = prefs.getString("theme", SkiThemeOption.LIGHT.name) ?: SkiThemeOption.LIGHT.name
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

    var activeResortId: String
        get() = prefs.getString("active_resort", "niseko") ?: "niseko"
        set(value) { prefs.edit().putString("active_resort", value).apply() }
}
