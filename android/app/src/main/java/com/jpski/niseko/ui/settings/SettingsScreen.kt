package com.jpski.niseko.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jpski.niseko.data.*
import com.jpski.niseko.ui.theme.*

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    currentTheme: SkiThemeOption,
    currentFontScale: Float,
    onThemeSelected: (SkiThemeOption) -> Unit,
    onFontScaleSelected: (Float) -> Unit,
    activeResortId: String,
    onResortSelected: (String) -> Unit,
) {
    val colors = SkiTheme.colors

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        // Resort picker
        item {
            Text(
                "Resort",
                color = colors.text,
                fontSize = 18.scaledSp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(12.dp))

            // Niseko standalone
            for (resort in NISEKO_RESORTS) {
                ResortCard(
                    name = resort.name,
                    isSelected = resort.id == activeResortId,
                    onClick = { onResortSelected(resort.id) },
                )
                Spacer(Modifier.height(8.dp))
            }

            Spacer(Modifier.height(12.dp))
            Text(
                "Epic Resorts",
                color = colors.textDim,
                fontSize = 14.scaledSp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))

            // Group Vail resorts by region
            val regionGroups = VAIL_RESORTS.groupBy { it.region }
            for ((region, resorts) in regionGroups) {
                Text(
                    region,
                    color = colors.textDim,
                    fontSize = 11.scaledSp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    for (resort in resorts) {
                        CompactResortCard(
                            name = resort.name,
                            isSelected = resort.id == activeResortId,
                            onClick = { onResortSelected(resort.id) },
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                "Ikon Pass",
                color = colors.textDim,
                fontSize = 14.scaledSp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))

            val ikonRegionGroups = IKON_RESORTS.groupBy { it.region }
            for ((region, resorts) in ikonRegionGroups) {
                Text(
                    region,
                    color = colors.textDim,
                    fontSize = 11.scaledSp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    for (resort in resorts) {
                        CompactResortCard(
                            name = resort.name,
                            isSelected = resort.id == activeResortId,
                            onClick = { onResortSelected(resort.id) },
                        )
                    }
                }
            }
        }

        // Theme picker
        item {
            Text(
                "Theme",
                color = colors.text,
                fontSize = 18.scaledSp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(12.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                for (option in SkiThemeOption.entries) {
                    ThemeSwatch(
                        option = option,
                        isSelected = option == currentTheme,
                        onClick = { onThemeSelected(option) },
                    )
                }
            }
        }

        // Font size
        item {
            Text(
                "Font Size",
                color = colors.text,
                fontSize = 18.scaledSp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(12.dp))
            val options = listOf(
                "Default" to 1f,
                "Large" to 1.15f,
                "Extra Large" to 1.3f,
                "Huge" to 1.5f,
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((label, scale) in options) {
                    FontScaleOption(
                        label = label,
                        isSelected = currentFontScale == scale,
                        onClick = { onFontScaleSelected(scale) },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Preview: The quick brown fox jumps over the lazy dog",
                color = colors.textDim,
                fontSize = 14.scaledSp,
            )
        }

        item { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun ResortCard(name: String, isSelected: Boolean, onClick: () -> Unit) {
    val colors = SkiTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(colors.card)
            .then(
                if (isSelected) Modifier.border(2.dp, colors.accent, RoundedCornerShape(10.dp))
                else Modifier.border(1.dp, colors.cardBorder, RoundedCornerShape(10.dp))
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            name,
            color = if (isSelected) colors.accent else colors.text,
            fontSize = 15.scaledSp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun CompactResortCard(name: String, isSelected: Boolean, onClick: () -> Unit) {
    val colors = SkiTheme.colors

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (isSelected) colors.accent.copy(alpha = 0.15f) else colors.card)
            .then(
                if (isSelected) Modifier.border(1.5.dp, colors.accent, RoundedCornerShape(8.dp))
                else Modifier.border(0.5.dp, colors.cardBorder, RoundedCornerShape(8.dp))
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(
            name,
            color = if (isSelected) colors.accent else colors.text,
            fontSize = 12.scaledSp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun ThemeSwatch(
    option: SkiThemeOption,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val palette = option.palette
    val colors = SkiTheme.colors

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(palette.bg)
                .then(
                    if (isSelected) Modifier.border(2.dp, colors.accent, CircleShape)
                    else Modifier.border(1.dp, colors.cardBorder, CircleShape)
                ),
        ) {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(palette.accent)
                    .align(Alignment.Center),
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            option.label,
            color = if (isSelected) colors.accent else colors.textDim,
            fontSize = 11.scaledSp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun FontScaleOption(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val colors = SkiTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (isSelected) colors.accent.copy(alpha = 0.15f) else colors.card)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            color = if (isSelected) colors.accent else colors.text,
            fontSize = 15.scaledSp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

