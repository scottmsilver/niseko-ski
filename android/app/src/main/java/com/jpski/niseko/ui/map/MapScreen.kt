package com.jpski.niseko.ui.map

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import com.jpski.niseko.data.ResortData

@Composable
fun MapScreen(data: Map<String, ResortData>) {
    Configuration.getInstance().userAgentValue = "com.jpski.niseko"

    val openTopoSource = remember {
        XYTileSource(
            "OpenTopoMap",
            0, 17, 256, ".png",
            arrayOf("https://a.tile.opentopomap.org/", "https://b.tile.opentopomap.org/", "https://c.tile.opentopomap.org/"),
        )
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            MapView(ctx).apply {
                setTileSource(openTopoSource)
                setMultiTouchControls(true)
                controller.setZoom(13.5)
                controller.setCenter(GeoPoint(42.8593, 140.6777))
                @Suppress("DEPRECATION")
                setBuiltInZoomControls(false)
                isTilesScaledToDpi = true
            }
        },
    )
}
