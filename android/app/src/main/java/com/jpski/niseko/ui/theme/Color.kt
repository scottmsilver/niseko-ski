package com.jpski.niseko.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.jpski.niseko.data.LiftStatus

data class NisekoColors(
    val bg: Color,
    val card: Color,
    val cardBorder: Color,
    val text: Color,
    val textDim: Color,
    val accent: Color,
    val accentSecondary: Color,
    val accentTertiary: Color,
    val statusOpen: Color,
    val statusSlowed: Color,
    val statusStandby: Color,
    val statusOnHold: Color,
    val statusClosed: Color,
    val error: Color,
    val tabBg: Color,
    val isDark: Boolean,
)

val LocalNisekoColors = staticCompositionLocalOf { LightPalette }

val LightPalette = NisekoColors(
    bg = Color(0xFFF5F5F7),
    card = Color(0xFFFFFFFF),
    cardBorder = Color(0xFFE2E2E7),
    text = Color(0xFF1C1C1E),
    textDim = Color(0xFF8E8E93),
    accent = Color(0xFFE85D75),
    accentSecondary = Color(0xFF7C6FD4),
    accentTertiary = Color(0xFF2EBDA0),
    statusOpen = Color(0xFF34C759),
    statusSlowed = Color(0xFFC49000),
    statusStandby = Color(0xFF4A90D9),
    statusOnHold = Color(0xFFD47A1A),
    statusClosed = Color(0xFF7C6FD4),
    error = Color(0xFFFF3B30),
    tabBg = Color(0xFFFFFFFF),
    isDark = false,
)

val DarkPalette = NisekoColors(
    bg = Color(0xFF1A1A2E),
    card = Color(0xFF16213E),
    cardBorder = Color(0xFF2A2F5B),
    text = Color(0xFFFEF0F5),
    textDim = Color(0xFFB8A9C9),
    accent = Color(0xFFFF6B9D),
    accentSecondary = Color(0xFFA29BFE),
    accentTertiary = Color(0xFF55EFC4),
    statusOpen = Color(0xFF7BED9F),
    statusSlowed = Color(0xFFECCC68),
    statusStandby = Color(0xFF70A1FF),
    statusOnHold = Color(0xFFFF9F43),
    statusClosed = Color(0xFFA29BFE),
    error = Color(0xFFFF6B81),
    tabBg = Color(0xFF0F0F23),
    isDark = true,
)

val PowderPalette = NisekoColors(
    bg = Color(0xFF0B1628),
    card = Color(0xFF0F1F3A),
    cardBorder = Color(0xFF1C3366),
    text = Color(0xFFE8F1FF),
    textDim = Color(0xFF8BABC7),
    accent = Color(0xFF5CB8FF),
    accentSecondary = Color(0xFF88A4FF),
    accentTertiary = Color(0xFF4FD1C5),
    statusOpen = Color(0xFF7BED9F),
    statusSlowed = Color(0xFFFFD93D),
    statusStandby = Color(0xFF5CB8FF),
    statusOnHold = Color(0xFFFF9F43),
    statusClosed = Color(0xFF88A4FF),
    error = Color(0xFFFF6B6B),
    tabBg = Color(0xFF060E1C),
    isDark = true,
)

val SakuraPalette = NisekoColors(
    bg = Color(0xFF1E0A14),
    card = Color(0xFF2D1423),
    cardBorder = Color(0xFF4A2040),
    text = Color(0xFFFFE8F0),
    textDim = Color(0xFFC9A0B4),
    accent = Color(0xFFFF85A2),
    accentSecondary = Color(0xFFC77DBA),
    accentTertiary = Color(0xFFF0B3D0),
    statusOpen = Color(0xFF7BED9F),
    statusSlowed = Color(0xFFFFD93D),
    statusStandby = Color(0xFF85B8FF),
    statusOnHold = Color(0xFFFF9F43),
    statusClosed = Color(0xFFC77DBA),
    error = Color(0xFFFF6B81),
    tabBg = Color(0xFF150812),
    isDark = true,
)

val SunsetPalette = NisekoColors(
    bg = Color(0xFF1A0F05),
    card = Color(0xFF2E1A0A),
    cardBorder = Color(0xFF4D3018),
    text = Color(0xFFFFF0E0),
    textDim = Color(0xFFC9A888),
    accent = Color(0xFFFF8C42),
    accentSecondary = Color(0xFFFFB347),
    accentTertiary = Color(0xFFFF6B6B),
    statusOpen = Color(0xFF7BED9F),
    statusSlowed = Color(0xFFFFD93D),
    statusStandby = Color(0xFF70A1FF),
    statusOnHold = Color(0xFFFF8C42),
    statusClosed = Color(0xFFC49CDE),
    error = Color(0xFFFF6B81),
    tabBg = Color(0xFF120A03),
    isDark = true,
)

val LiftStatus.color: Color
    @Composable
    @ReadOnlyComposable
    get() {
        val c = LocalNisekoColors.current
        return when (this) {
            LiftStatus.OPERATING -> c.statusOpen
            LiftStatus.OPERATION_SLOWED -> c.statusSlowed
            LiftStatus.STANDBY -> c.statusStandby
            LiftStatus.ON_HOLD -> c.statusOnHold
            LiftStatus.CLOSED, LiftStatus.CLOSED2 -> c.statusClosed
        }
    }
