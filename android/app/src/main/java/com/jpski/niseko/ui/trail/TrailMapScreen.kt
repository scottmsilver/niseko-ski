package com.jpski.niseko.ui.trail

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Log
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.jpski.niseko.BuildConfig
import com.jpski.niseko.ui.theme.SkiTheme
import com.jpski.niseko.ui.theme.scaledSp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

private val trailMapClient = OkHttpClient.Builder()
    .connectTimeout(45, TimeUnit.SECONDS)
    .readTimeout(45, TimeUnit.SECONDS)
    .build()

@Composable
fun TrailMapScreen(resortId: String = "niseko") {
    val context = LocalContext.current
    val colors = SkiTheme.colors
    val prefs = remember(resortId) {
        context.getSharedPreferences("trail_map_state_$resortId", Context.MODE_PRIVATE)
    }

    var isLoading by remember(resortId) { mutableStateOf(true) }
    var errorMsg by remember(resortId) { mutableStateOf<String?>(null) }
    var bitmapPair by remember(resortId) {
        mutableStateOf<Pair<android.graphics.Bitmap?, ImageBitmap?>>(null to null)
    }

    val screenWidth = context.resources.displayMetrics.widthPixels

    // Load bitmap with proper lifecycle management via DisposableEffect
    DisposableEffect(resortId) {
        isLoading = true
        errorMsg = null
        bitmapPair = null to null

        val scope = CoroutineScope(Dispatchers.IO)
        scope.launch {
            try {
                val androidBitmap = if (resortId == "niseko") {
                    // First pass: get dimensions only
                    val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    context.assets.open("trail-map.jpg").use { stream ->
                        BitmapFactory.decodeStream(stream, null, boundsOptions)
                    }
                    val sampleSize = maxOf(1, minOf(
                        boundsOptions.outWidth / screenWidth,
                        boundsOptions.outHeight / screenWidth
                    ))
                    // Second pass: decode with downsampling
                    context.assets.open("trail-map.jpg").use { stream ->
                        val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
                        BitmapFactory.decodeStream(stream, null, decodeOptions)
                    }
                } else {
                    val url = "${BuildConfig.API_BASE}/api/trailmap/$resortId"
                    val request = Request.Builder().url(url).build()
                    trailMapClient.newCall(request).execute().use { response ->
                        if (!response.isSuccessful) {
                            throw Exception("HTTP ${response.code}")
                        }
                        val bytes = response.body?.bytes() ?: throw Exception("Empty response")

                        // First pass: get dimensions
                        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, boundsOptions)

                        // Calculate sample size based on screen width
                        val sampleSize = maxOf(1, minOf(
                            boundsOptions.outWidth / screenWidth,
                            boundsOptions.outHeight / screenWidth
                        ))

                        // Second pass: decode with downsampling
                        val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOptions)
                            ?: throw Exception("Failed to decode bitmap")
                    }
                }
                withContext(Dispatchers.Main) {
                    if (androidBitmap != null) {
                        bitmapPair = androidBitmap to androidBitmap.asImageBitmap()
                    } else {
                        errorMsg = "Failed to decode trail map"
                    }
                    isLoading = false
                }
            } catch (e: Exception) {
                Log.e("TrailMap", "Failed to load trail map", e)
                withContext(Dispatchers.Main) {
                    errorMsg = "Trail map not available"
                    isLoading = false
                }
            }
        }
        onDispose {
            scope.cancel()
            bitmapPair.first?.recycle()
            bitmapPair = null to null
        }
    }

    val (_, bitmap) = bitmapPair

    if (isLoading) {
        Box(Modifier.fillMaxSize().background(colors.bg), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = colors.accent)
                Spacer(Modifier.height(8.dp))
                Text("Loading trail map...", color = colors.textDim, fontSize = 13.scaledSp)
            }
        }
        return
    }

    if (bitmap == null || errorMsg != null) {
        Box(Modifier.fillMaxSize().background(colors.bg), contentAlignment = Alignment.Center) {
            Text(errorMsg ?: "Failed to load trail map", color = colors.textDim, fontSize = 13.scaledSp)
        }
        return
    }

    var scale by remember(resortId) { mutableFloatStateOf(1f) }
    var offsetX by remember(resortId) { mutableFloatStateOf(0f) }
    var offsetY by remember(resortId) { mutableFloatStateOf(0f) }
    var containerSize by remember(resortId) { mutableStateOf(IntSize.Zero) }
    var fitted by remember(resortId) { mutableStateOf(false) }

    fun saveTrailState() {
        prefs.edit()
            .putFloat("trail_scale", scale)
            .putFloat("trail_offset_x", offsetX)
            .putFloat("trail_offset_y", offsetY)
            .apply()
    }

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
            .background(colors.bg)
            .onSizeChanged { size ->
                containerSize = size
                if (!fitted) {
                    fitted = true
                    val savedScale = prefs.getFloat("trail_scale", 0f)
                    if (savedScale > 0f) {
                        scale = savedScale
                        offsetX = prefs.getFloat("trail_offset_x", 0f)
                        offsetY = prefs.getFloat("trail_offset_y", 0f)
                    } else {
                        val scaleX = size.width.toFloat() / bitmap.width
                        val scaleY = size.height.toFloat() / bitmap.height
                        scale = minOf(scaleX, scaleY)
                        offsetX = (size.width - bitmap.width * scale) / 2f
                        offsetY = (size.height - bitmap.height * scale) / 2f
                    }
                }
            }
            .pointerInput(resortId) {
                detectTransformGestures { centroid, pan, zoom, _ ->
                    val newScale = (scale * zoom).coerceIn(minScale, maxScale)
                    val ratio = newScale / scale
                    offsetX = centroid.x - (centroid.x - offsetX) * ratio + pan.x
                    offsetY = centroid.y - (centroid.y - offsetY) * ratio + pan.y
                    scale = newScale
                    saveTrailState()
                }
            }
            .pointerInput(resortId) {
                detectTapGestures(
                    onDoubleTap = { tap ->
                        val newScale = (scale * 2f).coerceIn(minScale, maxScale)
                        val ratio = newScale / scale
                        offsetX = tap.x - (tap.x - offsetX) * ratio
                        offsetY = tap.y - (tap.y - offsetY) * ratio
                        scale = newScale
                        saveTrailState()
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
