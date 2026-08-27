package fit.aquazero.app.feature.coach

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.CoachesRepository
import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.designsystem.AssetImage
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.BrandAssets
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class CoachSelectViewModel @Inject constructor(
    private val coachesRepository: CoachesRepository,
) : ViewModel() {

    val coaches: StateFlow<List<CoachEntity>> = coachesRepository
        .coaches()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            coachesRepository.refreshRoster()
        }
    }

    fun selectCoach(coachId: String, onDone: () -> Unit) {
        viewModelScope.launch {
            coachesRepository.selectCoach(coachId)
            onDone()
        }
    }
}

val KNOWN_COACHES = listOf(
    "akin" to ("Akin" to "Adaptive, analytical AI coach focused on progressive overload and hydration precision."),
    "anderson" to ("Anderson" to "High-tempo conditioning specialist with emphasis on striking and dynamic mobility."),
    "jacare" to ("Jacare" to "Ground control and functional core strength mentor."),
    "kazushi" to ("Kazushi" to "Unconventional endurance and resilience strategist."),
    "king" to ("King" to "Powerlifting and heavy-compound volume specialist."),
    "mataemon" to ("Mataemon" to "Disciplined traditional form and posture master."),
    "ogun" to ("Ogun" to "Explosive strength, calisthenics, and high-intensity output."),
    "sanzo" to ("Sanzo" to "Mind-body recovery and breathing-led mobility guide."),
    "uthman" to ("Uthman" to "Tactical endurance and hybrid functional fitness coach.")
)

@Composable
fun CoachSelectScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CoachSelectViewModel = hiltViewModel(),
) {
    val coachEntities by viewModel.coaches.collectAsState()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_coach_select).uppercase(), onBack = onBack)
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerPadding)
        ) {
            item {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "AI COACHING ROSTER",
                        style = MaterialTheme.typography.labelMedium,
                        color = AzfColors.SecondaryFixedDim
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "CHOOSE YOUR COACH",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Each coach brings a distinct personality, encouragement style, and training discipline.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
            }

            items(KNOWN_COACHES) { (id, info) ->
                val (name, bio) = info
                val entity = coachEntities.firstOrNull { it.coachId == id }
                val isUnlocked = entity?.unlocked ?: (id == "akin")

                AzfCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                        .clickable {
                            if (isUnlocked) {
                                viewModel.selectCoach(id, onDone = onBack)
                            }
                        }
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AssetImage(
                            assetPath = BrandAssets.coachAvatar(id),
                            contentDescription = name,
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                        )
                        Spacer(modifier = Modifier.size(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = name.uppercase(),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                AzfChip(
                                    text = if (isUnlocked) "ACTIVE" else "LVL ${entity?.requiredLevel ?: 5}",
                                    selected = isUnlocked,
                                    onClick = {
                                        if (isUnlocked) viewModel.selectCoach(id, onDone = onBack)
                                    }
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = bio,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}
