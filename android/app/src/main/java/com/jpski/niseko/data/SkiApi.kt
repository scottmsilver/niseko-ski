package com.jpski.niseko.data

import android.util.Log
import com.jpski.niseko.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import androidx.annotation.WorkerThread
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
        "\u5439\u96EA" to "Snow Storm", "\u5927\u96EA" to "Heavy Snow", "\u5C0F\u96EA" to "Light Snow",
        "\u96EA" to "Snow", "\u66C7\u308A" to "Cloudy", "\u6674\u308C" to "Clear", "\u96E8" to "Rain",
        "\u7C89\u96EA" to "Powder Snow", "\u5727\u96EA" to "Packed Powder", "\u6E7F\u96EA" to "Wet Snow",
        "\u5168\u9762\u53EF\u80FD" to "All Courses Open", "\u4E00\u90E8\u53EF\u80FD" to "Partial Open", "\u9589\u9396" to "Closed",
        "\u306A\u3057" to "\u2014",
    )

    private fun translate(s: String?): String = if (s.isNullOrBlank()) "\u2014" else jpEn[s] ?: s

    @WorkerThread
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
        ResortType.ALTA -> fetchAltaData(resort)
        ResortType.SNOWBIRD -> fetchSnowbirdData(resort)
    }

    // ── Display endpoint (server-vended) ──

    private fun fetchDisplayData(resortId: String): List<SubResortData>? {
        val json = fetchJson("$API_BASE/api/display/$resortId") ?: return null
        val subResortsArr = json.optJSONArray("subResorts") ?: return null
        return try {
            (0 until subResortsArr.length()).map { i ->
                val sr = subResortsArr.getJSONObject(i)
                val liftsArr = sr.optJSONArray("lifts")
                val lifts = if (liftsArr != null) {
                    (0 until liftsArr.length()).map { j ->
                        val obj = liftsArr.getJSONObject(j)
                        val displayObj = obj.optJSONObject("display")
                        val display = if (displayObj != null) LiftDisplay(
                            detailText = displayObj.optString("detailText", ""),
                            left = displayObj.optString("left", ""),
                            leftCls = displayObj.optString("leftCls", ""),
                            right = displayObj.optString("right", ""),
                            rightCls = displayObj.optString("rightCls", ""),
                        ) else null
                        LiftInfo(
                            id = when (val idVal = obj.opt("id")) {
                                is Int -> idVal
                                is Number -> idVal.toInt()
                                is String -> idVal.hashCode()
                                else -> j
                            },
                            name = obj.optString("name", ""),
                            status = obj.optString("status", "CLOSED"),
                            startTime = obj.optString("start_time", "").let { if (it == "null") "" else it },
                            endTime = obj.optString("end_time", "").let { if (it == "null") "" else it },
                            updateDate = obj.optString("updateDate", null).takeIf { !it.isNullOrBlank() && it != "null" },
                            liftType = obj.optString("liftType", null).takeIf { !it.isNullOrBlank() && it != "null" },
                            capacity = if (obj.has("capacity") && !obj.isNull("capacity")) obj.optInt("capacity", 0).takeIf { it > 0 } else null,
                            waitMinutes = if (obj.has("waitMinutes") && !obj.isNull("waitMinutes")) obj.optInt("waitMinutes", 0) else null,
                            comment = obj.optString("comment", null).takeIf { !it.isNullOrBlank() && it != "null" },
                            display = display,
                        )
                    }
                } else null
                SubResortData(
                    id = sr.optString("id", ""),
                    name = sr.optString("name", ""),
                    lifts = lifts,
                    weather = null,
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse display data for $resortId", e)
            null
        }
    }

    // ── Server-vended weather stations ──

    private fun fetchWeatherStations(resortId: String): Map<String, List<WeatherStationDisplay>>? {
        val json = fetchJson("$API_BASE/api/weather/$resortId") ?: return null
        val subResortsArr = json.optJSONArray("subResorts") ?: return null
        return try {
            val map = mutableMapOf<String, List<WeatherStationDisplay>>()
            for (i in 0 until subResortsArr.length()) {
                val sr = subResortsArr.getJSONObject(i)
                val id = sr.optString("id", "")
                val stationsArr = sr.optJSONArray("stations") ?: continue
                val stations = (0 until stationsArr.length()).map { j ->
                    val s = stationsArr.getJSONObject(j)
                    WeatherStationDisplay(
                        label = s.optString("label", ""),
                        tempF = s.optString("tempF", "\u2014"),
                        weather = s.optString("weather", "\u2014"),
                        icon = s.optString("icon", ""),
                        snowDisplay = s.optString("snowDisplay", "\u2014"),
                        snow24hDisplay = s.optString("snow24hDisplay", "\u2014"),
                        snowState = s.optString("snowState", "\u2014"),
                        wind = s.optString("wind", "\u2014"),
                        courses = s.optString("courses", "\u2014"),
                    )
                }
                map[id] = stations
            }
            map
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse weather data for $resortId", e)
            null
        }
    }

    // ── Niseko ──

    private suspend fun fetchNisekoData(resort: ResortConfig): FetchResult = coroutineScope {
        val displayDeferred = async(Dispatchers.IO) { fetchDisplayData("niseko") }
        val weatherDeferred = async(Dispatchers.IO) { fetchWeatherStations("niseko") }
        val displaySubs = displayDeferred.await()
        val wxMap = weatherDeferred.await()

        val subResorts = if (displaySubs != null) {
            if (wxMap != null) {
                // Server-vended lifts + server-vended weather
                displaySubs.map { sr -> sr.copy(stations = wxMap[sr.id]) }
            } else {
                // Server-vended lifts + fallback client-side weather
                val weatherDeferreds = NISEKO_SUB_RESORTS.map { sub ->
                    async(Dispatchers.IO) { sub.id to fetchNisekoWeather(sub.id) }
                }
                val weatherMap = weatherDeferreds.awaitAll().toMap()
                displaySubs.map { sr -> sr.copy(weather = weatherMap[sr.id]) }
            }
        } else {
            // Fallback: fetch everything client-side
            val weatherDeferreds = NISEKO_SUB_RESORTS.map { sub ->
                async(Dispatchers.IO) { sub.id to fetchNisekoWeather(sub.id) }
            }
            val weatherMap = weatherDeferreds.awaitAll().toMap()
            NISEKO_SUB_RESORTS.map { sub ->
                SubResortData(sub.id, sub.name, fetchNisekoLifts(sub.id), weatherMap[sub.id],
                    stations = wxMap?.get(sub.id))
            }
        }
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
        val displayDeferred = async(Dispatchers.IO) { fetchDisplayData(resort.id) }
        val weatherDeferred = async(Dispatchers.IO) { fetchWeatherStations(resort.id) }
        val displaySubs = displayDeferred.await()
        val wxMap = weatherDeferred.await()

        val subResorts = displaySubs ?: fetchVailTerrain(resort)

        // Attach weather to first sub-resort
        val wxStations = wxMap?.values?.firstOrNull()
        val result = if (wxStations != null && subResorts.isNotEmpty()) {
            val first = subResorts[0].copy(stations = wxStations)
            listOf(first) + subResorts.drop(1)
        } else if (subResorts.isNotEmpty()) {
            // Fallback: client-side weather parsing
            val weather = async(Dispatchers.IO) { fetchVailWeather(resort) }.await()
            if (weather != null) {
                val first = subResorts[0].copy(weather = weather)
                listOf(first) + subResorts.drop(1)
            } else {
                subResorts
            }
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
                startTime = obj.optString("OpenTime", "").let { if (it.isBlank() || it == "null") "" else it },
                endTime = obj.optString("CloseTime", "").let { if (it.isBlank() || it == "null") "" else it },
                liftType = obj.optString("Type", null).takeIf { !it.isNullOrBlank() },
                capacity = if (obj.has("Capacity") && obj.optInt("Capacity", 0) > 0) obj.optInt("Capacity") else null,
                waitMinutes = if (obj.has("WaitTimeInMinutes") && !obj.isNull("WaitTimeInMinutes")) obj.optInt("WaitTimeInMinutes", 0) else null,
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

    @WorkerThread
    private fun fetchJsonArray(url: String): JSONArray? {
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
                JSONArray(response.body?.string() ?: return null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchJsonArray failed for $url", e)
            null
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

    // ── Alta ──

    private suspend fun fetchAltaData(resort: ResortConfig): FetchResult = coroutineScope {
        val displaySubs = async(Dispatchers.IO) { fetchDisplayData("alta") }.await()
        val subResorts = displaySubs ?: listOf(SubResortData("alta", "Alta", fetchAltaLifts(), null))
        FetchResult(subResorts = subResorts, capabilities = resort.capabilities)
    }

    private fun fetchAltaLifts(): List<LiftInfo>? {
        val json = fetchJson("$API_BASE/api/alta") ?: return null
        val liftsArray = json.optJSONArray("lifts") ?: return emptyList()
        return try {
            (0 until liftsArray.length()).map { i ->
                val obj = liftsArray.getJSONObject(i)
                val isOpen = obj.optBoolean("open", false)
                val status = if (isOpen) LiftStatus.OPERATING else LiftStatus.CLOSED
                LiftInfo(
                    id = obj.optString("name", "").hashCode(),
                    name = obj.optString("name", ""),
                    status = status.apiValue,
                    startTime = obj.optString("opening_at", "").ifBlank { "08:00" },
                    endTime = obj.optString("closing_at", "").ifBlank { "16:00" },
                    vailStatus = if (isOpen) "Open" else if (obj.has("opening_at") && obj.optString("opening_at", "").isNotBlank()) "Scheduled" else "Closed",
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse Alta lifts", e)
            null
        }
    }

    // ── Snowbird ──

    private suspend fun fetchSnowbirdData(resort: ResortConfig): FetchResult = coroutineScope {
        val displaySubs = async(Dispatchers.IO) { fetchDisplayData("snowbird") }.await()
        if (displaySubs != null) {
            return@coroutineScope FetchResult(displaySubs, resort.capabilities)
        }
        // Fallback: fetch and parse client-side
        val lifts = async(Dispatchers.IO) { fetchSnowbirdLifts() }.await()
        val areas = mutableMapOf<String, MutableList<LiftInfo>>()
        lifts?.forEach { lift ->
            val area = lift.comment ?: "Snowbird"
            areas.getOrPut(area) { mutableListOf() }.add(lift)
        }
        val subResorts = if (areas.isEmpty()) {
            listOf(SubResortData("snowbird", "Snowbird", lifts, null))
        } else {
            areas.map { (name, areaLifts) ->
                SubResortData(
                    id = name.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
                    name = name,
                    lifts = areaLifts.map { it.copy(comment = null) },
                    weather = null,
                )
            }
        }
        FetchResult(subResorts, resort.capabilities)
    }

    private fun fetchSnowbirdLifts(): List<LiftInfo>? {
        val arr = fetchJsonArray("$API_BASE/api/snowbird/lifts") ?: return null
        val statusMap = mapOf("open" to "OPERATING", "expected" to "CLOSED", "closed" to "CLOSED")
        return try {
            (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                val rawStatus = obj.optString("status", "closed")
                val status = statusMap[rawStatus] ?: "CLOSED"
                val sectorName = obj.optJSONObject("sector")?.optString("name", "Snowbird") ?: "Snowbird"

                // Parse hours like "9:00 AM - 4:00 PM"
                var start = "08:00"
                var end = "16:00"
                val hours = obj.optString("hours", "").trim()
                val m = Regex("^([\\d:]+\\s*[AP]M)\\s*-\\s*([\\d:]+\\s*[AP]M)$", RegexOption.IGNORE_CASE).find(hours)
                if (m != null) {
                    start = to24(m.groupValues[1]) ?: "08:00"
                    end = to24(m.groupValues[2]) ?: "16:00"
                }

                LiftInfo(
                    id = obj.optString("name", "").hashCode(),
                    name = obj.optString("name", ""),
                    status = status,
                    startTime = start,
                    endTime = end,
                    comment = sectorName,
                    vailStatus = when (rawStatus) {
                        "open" -> "Open"
                        "expected" -> "Scheduled"
                        else -> "Closed"
                    },
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse Snowbird lifts", e)
            null
        }
    }

    private fun to24(timeStr: String): String? {
        val m = Regex("(\\d+)(?::(\\d+))?\\s*(AM|PM)", RegexOption.IGNORE_CASE).find(timeStr) ?: return null
        var h = m.groupValues[1].toIntOrNull() ?: return null
        val min = m.groupValues[2].ifBlank { "00" }
        val ampm = m.groupValues[3].uppercase()
        if (ampm == "PM" && h != 12) h += 12
        if (ampm == "AM" && h == 12) h = 0
        return "${h.toString().padStart(2, '0')}:$min"
    }
}
