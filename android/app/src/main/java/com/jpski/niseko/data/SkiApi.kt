package com.jpski.niseko.data

import android.util.Log
import com.jpski.niseko.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SkiApi {
    companion object {
        private const val TAG = "SkiApi"
        private val API_BASE = BuildConfig.API_BASE

        private val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    // Japanese to English translations for Niseko weather
    private val jpEn = mapOf(
        "\u5439\u96EA" to "Snow Storm", "\u96EA" to "Snow", "\u66C7\u308A" to "Cloudy", "\u6674\u308C" to "Clear",
        "\u7C89\u96EA" to "Powder Snow", "\u5727\u96EA" to "Packed Powder", "\u6E7F\u96EA" to "Wet Snow",
        "\u5168\u9762\u53EF\u80FD" to "All Courses Open", "\u4E00\u90E8\u53EF\u80FD" to "Partial Open", "\u9589\u9396" to "Closed",
        "\u306A\u3057" to "\u2014",
    )

    private fun translate(s: String?): String = if (s.isNullOrBlank()) "\u2014" else jpEn[s] ?: s

    private fun fetchJson(url: String): JSONObject? {
        val request = Request.Builder()
            .url(url)
            .addHeader("Accept", "application/json")
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "HTTP ${response.code} for $url")
                    return null
                }
                JSONObject(response.body?.string() ?: return null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchJson failed for $url", e)
            null
        }
    }

    suspend fun fetchData(resort: ResortConfig): FetchResult = when (resort.type) {
        ResortType.NISEKO -> fetchNisekoData(resort)
        ResortType.VAIL -> fetchVailData(resort)
    }

    // ── Niseko ──

    private suspend fun fetchNisekoData(resort: ResortConfig): FetchResult = coroutineScope {
        val subResorts = NISEKO_SUB_RESORTS.map { sub ->
            async(Dispatchers.IO) {
                val lifts = fetchNisekoLifts(sub.id)
                val weather = fetchNisekoWeather(sub.id)
                SubResortData(sub.id, sub.name, lifts, weather)
            }
        }.awaitAll()
        FetchResult(subResorts, resort.capabilities)
    }

    private fun fetchNisekoLifts(skiareaId: String): List<LiftInfo>? {
        val json = fetchJson("$API_BASE/api/niseko/lifts?skiareaId=$skiareaId") ?: return null
        val results = json.optJSONArray("results") ?: return emptyList()
        return try {
            (0 until results.length()).map { i ->
                val obj = results.getJSONObject(i)
                LiftInfo(
                    id = obj.optInt("id"),
                    name = obj.optString("name", ""),
                    status = obj.optString("status", "CLOSED"),
                    startTime = obj.optString("start_time", "08:00"),
                    endTime = obj.optString("end_time", "16:00"),
                    updateDate = obj.optString("updateDate", null),
                    comment = obj.optString("comment", null).takeIf { !it.isNullOrBlank() },
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse Niseko lifts for $skiareaId", e)
            null
        }
    }

    private fun fetchNisekoWeather(skiareaId: String): List<WeatherStation>? {
        val json = fetchJson("$API_BASE/api/niseko/weather?skiareaId=$skiareaId") ?: return null
        val results = json.optJSONArray("results") ?: return emptyList()
        return try {
            (0 until results.length()).map { i ->
                val obj = results.getJSONObject(i)
                WeatherStation(
                    name = obj.optString("name", ""),
                    temperature = if (obj.has("temperature")) obj.optDouble("temperature") else null,
                    weather = translate(obj.optString("weather", "")),
                    snowAccumulation = if (obj.has("snow_accumulation")) obj.optDouble("snow_accumulation") else null,
                    snowAccumulationDiff = if (obj.has("snow_accumulation_difference")) obj.optDouble("snow_accumulation_difference") else null,
                    snowState = translate(obj.optString("snow_state", "")),
                    windSpeed = obj.optString("wind_speed", "\u2014"),
                    courseState = translate(obj.optString("cource_state", "")),
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse Niseko weather for $skiareaId", e)
            null
        }
    }

    // ── Vail ──

    private suspend fun fetchVailData(resort: ResortConfig): FetchResult = coroutineScope {
        val terrainDeferred = async(Dispatchers.IO) { fetchVailTerrain(resort) }
        val weatherDeferred = async(Dispatchers.IO) { fetchVailWeather(resort) }
        val subResorts = terrainDeferred.await()
        val weather = weatherDeferred.await()

        // Attach weather to first sub-resort
        val result = if (weather != null && subResorts.isNotEmpty()) {
            val first = subResorts[0].copy(weather = weather)
            listOf(first) + subResorts.drop(1)
        } else {
            subResorts
        }

        FetchResult(result, resort.capabilities)
    }

    private fun fetchVailTerrain(resort: ResortConfig): List<SubResortData> {
        val json = fetchJson("$API_BASE/api/vail/${resort.id}/terrain") ?: return emptyList()
        val liftsArray = json.optJSONArray("Lifts") ?: return emptyList()

        // Group lifts by Mountain area
        val areas = mutableMapOf<String, MutableList<LiftInfo>>()
        for (i in 0 until liftsArray.length()) {
            val obj = liftsArray.getJSONObject(i)
            val area = obj.optString("Mountain", resort.name).ifBlank { resort.name }
            val statusStr = obj.optString("Status", "Closed")
            val status = LiftStatus.fromVailStatus(statusStr)

            val lift = LiftInfo(
                id = obj.optString("Name", "").hashCode(),
                name = obj.optString("Name", ""),
                status = status.apiValue,
                startTime = obj.optString("OpenTime", "").ifBlank { "08:00" },
                endTime = obj.optString("CloseTime", "").ifBlank { "16:00" },
                liftType = obj.optString("Type", null).takeIf { !it.isNullOrBlank() },
                capacity = if (obj.has("Capacity") && obj.optInt("Capacity", 0) > 0) obj.optInt("Capacity") else null,
                waitMinutes = obj.optInt("WaitTimeInMinutes", 0),
                vailStatus = statusStr,
            )

            areas.getOrPut(area) { mutableListOf() }.add(lift)
        }

        return areas.map { (name, lifts) ->
            SubResortData(
                id = name.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
                name = name,
                lifts = lifts,
                weather = null,
            )
        }
    }

    private fun fetchVailWeather(resort: ResortConfig): List<WeatherStation>? {
        val json = fetchJson("$API_BASE/api/vail/${resort.id}/weather") ?: return null
        return try {
            val baseSnow = json.optJSONObject("BaseSnowReadings")
            val midMountain = baseSnow?.optJSONObject("MidMountain")
            val newSnow = json.optJSONObject("NewSnowReadings")
            val newSnow24 = newSnow?.optJSONObject("TwentyFourHours")
            val runs = json.optJSONObject("Runs")
            val snowConditions = json.optString("SnowConditions", "")

            val snowAccum = midMountain?.optString("Centimeters", null)?.toIntOrNull()?.toDouble()
            val newSnowCm = newSnow24?.optString("Centimeters", null)?.toIntOrNull()?.toDouble()
            val runsOpen = runs?.optInt("Open", 0) ?: 0
            val runsTotal = runs?.optInt("Total", 0) ?: 0

            listOf(
                WeatherStation(
                    name = resort.name,
                    temperature = null,
                    weather = snowConditions,
                    snowAccumulation = snowAccum,
                    snowAccumulationDiff = newSnowCm,
                    snowState = snowConditions,
                    windSpeed = "\u2014",
                    courseState = "$runsOpen / $runsTotal runs",
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse Vail weather for ${resort.id}", e)
            null
        }
    }
}
