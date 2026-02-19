package com.jpski.niseko.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.jpski.niseko.R

val Nunito = FontFamily(
    Font(R.font.nunito_regular, FontWeight.Normal),
    Font(R.font.nunito_medium, FontWeight.Medium),
    Font(R.font.nunito_semibold, FontWeight.SemiBold),
    Font(R.font.nunito_bold, FontWeight.Bold),
)

val NisekoTypography = Typography(
    headlineMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 20.sp),
    titleMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    titleSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    bodyMedium = TextStyle(fontFamily = Nunito, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = Nunito, fontSize = 12.sp),
    labelSmall = TextStyle(fontFamily = Nunito, fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontFamily = Nunito, fontSize = 12.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontFamily = Nunito, fontSize = 16.sp),
    titleLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 22.sp),
    headlineSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
    displaySmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 26.sp),
)
