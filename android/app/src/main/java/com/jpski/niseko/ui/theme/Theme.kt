package com.jpski.niseko.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.core.view.WindowCompat

enum class NisekoThemeOption(val label: String, val palette: NisekoColors) {
    LIGHT("Light", LightPalette),
    DARK("Dark", DarkPalette),
    POWDER("Powder", PowderPalette),
    SAKURA("Sakura", SakuraPalette),
    SUNSET("Sunset", SunsetPalette),
}

object NisekoTheme {
    val colors: NisekoColors
        @Composable
        @ReadOnlyComposable
        get() = LocalNisekoColors.current
}

@Composable
fun NisekoTheme(
    themeOption: NisekoThemeOption = NisekoThemeOption.LIGHT,
    fontScale: Float = 1f,
    content: @Composable () -> Unit,
) {
    val colors = themeOption.palette

    val colorScheme = if (colors.isDark) {
        darkColorScheme(
            primary = colors.accent,
            secondary = colors.accentSecondary,
            tertiary = colors.accentTertiary,
            background = colors.bg,
            surface = colors.card,
            onPrimary = colors.text,
            onSecondary = colors.text,
            onTertiary = colors.text,
            onBackground = colors.text,
            onSurface = colors.text,
            outline = colors.cardBorder,
            surfaceVariant = colors.card,
            onSurfaceVariant = colors.textDim,
        )
    } else {
        lightColorScheme(
            primary = colors.accent,
            secondary = colors.accentSecondary,
            tertiary = colors.accentTertiary,
            background = colors.bg,
            surface = colors.card,
            onPrimary = colors.text,
            onSecondary = colors.text,
            onTertiary = colors.text,
            onBackground = colors.text,
            onSurface = colors.text,
            outline = colors.cardBorder,
            surfaceVariant = colors.card,
            onSurfaceVariant = colors.textDim,
        )
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !colors.isDark
        }
    }

    CompositionLocalProvider(
        LocalNisekoColors provides colors,
        LocalFontScale provides fontScale,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = nisekoTypography(fontScale),
        ) {
            ProvideTextStyle(
                value = TextStyle(fontFamily = Nunito),
                content = content,
            )
        }
    }
}
