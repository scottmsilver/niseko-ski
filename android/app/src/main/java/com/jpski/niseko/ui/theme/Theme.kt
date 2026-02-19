package com.jpski.niseko.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle

private val NisekoDarkColorScheme = darkColorScheme(
    primary = NisekoPink,
    secondary = NisekoBlue,
    tertiary = NisekoTeal,
    background = NisekoBg,
    surface = NisekoCard,
    onPrimary = NisekoText,
    onSecondary = NisekoText,
    onTertiary = NisekoText,
    onBackground = NisekoText,
    onSurface = NisekoText,
    outline = NisekoCardBorder,
    surfaceVariant = NisekoCard,
    onSurfaceVariant = NisekoTextDim,
)

@Composable
fun NisekoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = NisekoDarkColorScheme,
        typography = NisekoTypography,
    ) {
        ProvideTextStyle(
            value = TextStyle(fontFamily = Nunito),
            content = content,
        )
    }
}
