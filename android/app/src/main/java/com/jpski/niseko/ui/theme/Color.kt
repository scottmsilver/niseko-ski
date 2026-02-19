package com.jpski.niseko.ui.theme

import androidx.compose.ui.graphics.Color
import com.jpski.niseko.data.LiftStatus

val NisekoBg = Color(0xFF1A1A2E)
val NisekoCard = Color(0xFF16213E)
val NisekoCardBorder = Color(0xFF2A2F5B)
val NisekoText = Color(0xFFFEF0F5)
val NisekoTextDim = Color(0xFFB8A9C9)
val NisekoGreen = Color(0xFF7BED9F)
val NisekoRed = Color(0xFFFF6B81)
val NisekoYellow = Color(0xFFECCC68)
val NisekoBlue = Color(0xFF70A1FF)
val NisekoOrange = Color(0xFFFF9F43)
val NisekoPink = Color(0xFFFF6B9D)
val NisekoPurple = Color(0xFFA29BFE)
val NisekoTeal = Color(0xFF55EFC4)
val NisekoTabBg = Color(0xFF0F0F23)

val LiftStatus.color: Color
    get() = when (this) {
        LiftStatus.OPERATING -> NisekoGreen
        LiftStatus.OPERATION_SLOWED -> NisekoYellow
        LiftStatus.STANDBY -> NisekoBlue
        LiftStatus.ON_HOLD -> NisekoOrange
        LiftStatus.CLOSED, LiftStatus.CLOSED2 -> NisekoPurple
    }
