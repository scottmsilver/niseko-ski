package com.jpski.niseko.ui.map

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import com.jpski.niseko.data.ResortData

@Composable
fun MapScreen(data: Map<String, ResortData>) {
    Configuration.getInstance().userAgentValue = "com.jpski.niseko"
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("niseko_map_state", Context.MODE_PRIVATE) }

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
            val savedLat = prefs.getFloat("map_lat", 42.8593f).toDouble()
            val savedLng = prefs.getFloat("map_lng", 140.6777f).toDouble()
            val savedZoom = prefs.getFloat("map_zoom", 13.5f).toDouble()

            MapView(ctx).apply {
                setTileSource(openTopoSource)
                setMultiTouchControls(true)
                controller.setZoom(savedZoom)
                controller.setCenter(GeoPoint(savedLat, savedLng))
                // osmdroid has no non-deprecated replacement for setBuiltInZoomControls;
                // suppression is intentional since we use multitouch zoom instead.
                @Suppress("DEPRECATION")
                setBuiltInZoomControls(false)
                isTilesScaledToDpi = true

                addMapListener(object : MapListener {
                    override fun onScroll(event: ScrollEvent?): Boolean {
                        saveMapState(prefs, this@apply)
                        return false
                    }
                    override fun onZoom(event: ZoomEvent?): Boolean {
                        saveMapState(prefs, this@apply)
                        return false
                    }
                })
            }
        },
    )
}

private fun saveMapState(prefs: SharedPreferences, map: MapView) {
    val center = map.mapCenter
    prefs.edit()
        .putFloat("map_lat", center.latitude.toFloat())
        .putFloat("map_lng", center.longitude.toFloat())
        .putFloat("map_zoom", map.zoomLevelDouble.toFloat())
        .apply()
}
