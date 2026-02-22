package com.jpski.niseko.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.jpski.niseko.R

val Nunito = FontFamily(
    Font(R.font.nunito_regular, FontWeight.Normal),
    Font(R.font.nunito_medium, FontWeight.Medium),
    Font(R.font.nunito_semibold, FontWeight.SemiBold),
    Font(R.font.nunito_bold, FontWeight.Bold),
)

val LocalFontScale = staticCompositionLocalOf { 1f }

val Int.scaledSp: TextUnit
    @Composable
    @ReadOnlyComposable
    get() = (this * LocalFontScale.current).sp

fun skiTypography(scale: Float = 1f): Typography {
    fun Float.s() = (this * scale).sp
    return Typography(
        displaySmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 28f.s()),
        headlineMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 22f.s()),
        headlineSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 20f.s()),
        titleLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 24f.s()),
        titleMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 17f.s()),
        titleSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 15f.s()),
        bodyLarge = TextStyle(fontFamily = Nunito, fontSize = 17f.s()),
        bodyMedium = TextStyle(fontFamily = Nunito, fontSize = 15f.s()),
        bodySmall = TextStyle(fontFamily = Nunito, fontSize = 13f.s()),
        labelMedium = TextStyle(fontFamily = Nunito, fontSize = 13f.s(), fontWeight = FontWeight.Medium),
        labelSmall = TextStyle(fontFamily = Nunito, fontSize = 12f.s(), fontWeight = FontWeight.SemiBold),
    )
}
