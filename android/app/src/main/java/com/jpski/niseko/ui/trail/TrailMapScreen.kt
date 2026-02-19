package com.jpski.niseko.ui.trail

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.sp
import com.jpski.niseko.ui.theme.NisekoBg
import com.jpski.niseko.ui.theme.NisekoTextDim

@Composable
fun TrailMapScreen() {
    val context = LocalContext.current
    val bitmap = remember {
        context.assets.open("trail-map.jpg").use { stream ->
            BitmapFactory.decodeStream(stream)?.asImageBitmap()
        }
    }

    if (bitmap == null) {
        Box(Modifier.fillMaxSize().background(NisekoBg), contentAlignment = Alignment.Center) {
            Text("Failed to load trail map", color = NisekoTextDim, fontSize = 13.sp)
        }
        return
    }

    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var fitted by remember { mutableStateOf(false) }

    val minScale = remember(containerSize, bitmap) {
        if (containerSize.width == 0 || containerSize.height == 0) 0.5f
        else {
            val scaleX = containerSize.width.toFloat() / bitmap.width
            val scaleY = containerSize.height.toFloat() / bitmap.height
            minOf(scaleX, scaleY) * 0.5f
        }
    }
    val maxScale = 8f

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .background(NisekoBg)
            .onSizeChanged { size ->
                containerSize = size
                if (!fitted) {
                    fitted = true
                    val scaleX = size.width.toFloat() / bitmap.width
                    val scaleY = size.height.toFloat() / bitmap.height
                    scale = minOf(scaleX, scaleY)
                    offsetX = (size.width - bitmap.width * scale) / 2f
                    offsetY = (size.height - bitmap.height * scale) / 2f
                }
            }
            .pointerInput(Unit) {
                detectTransformGestures { centroid, pan, zoom, _ ->
                    val newScale = (scale * zoom).coerceIn(minScale, maxScale)
                    val ratio = newScale / scale
                    offsetX = centroid.x - (centroid.x - offsetX) * ratio + pan.x
                    offsetY = centroid.y - (centroid.y - offsetY) * ratio + pan.y
                    scale = newScale
                }
            }
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = { tap ->
                        val newScale = (scale * 2f).coerceIn(minScale, maxScale)
                        val ratio = newScale / scale
                        offsetX = tap.x - (tap.x - offsetX) * ratio
                        offsetY = tap.y - (tap.y - offsetY) * ratio
                        scale = newScale
                    },
                )
            },
    ) {
        withTransform({
            translate(offsetX, offsetY)
            scale(scale, scale, Offset.Zero)
        }) {
            drawImage(bitmap, dstOffset = IntOffset.Zero, dstSize = IntSize(bitmap.width, bitmap.height))
        }
    }
}
