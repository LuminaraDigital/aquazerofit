package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Form controls shared by the onboarding essentials form and the settings
 * stack: a segmented picker, an option card, a consent checkbox row, a switch
 * row and a navigation row.
 *
 * They live in the design system rather than in one feature because both lanes
 * render the same consent copy against the same four bits, and a consent
 * control that looks different depending on where it is shown is a consent
 * control people stop trusting.
 *
 * Every one of them carries its own semantics: the whole row is the touch
 * target (48dp minimum), and the label is the accessible name so a screen
 * reader never announces a bare "switch".
 */

/** One option in an [AzfSegmented]. */
data class AzfSegmentOption<T>(val value: T, val label: String)

/**
 * A wrapping segmented picker. Wraps rather than scrolls: a horizontally
 * scrolling row of options inside a vertically scrolling form hides choices
 * from anyone who does not think to swipe it.
 */
@Composable
fun <T> AzfSegmented(
    label: String,
    options: List<AzfSegmentOption<T>>,
    selected: T?,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                AzfChip(
                    text = option.label,
                    selected = option.value == selected,
                    onClick = { onSelect(option.value) },
                )
            }
        }
        if (hint != null) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = hint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
    }
}

/**
 * A large tappable card for a choice that deserves a sentence of explanation —
 * the goal picker, where the difference between options is the thing being
 * chosen, not the word.
 */
@Composable
fun AzfOptionCard(
    title: String,
    body: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    val border = if (selected) AzfColors.PrimaryFixedDim else AzfColors.OutlineVariant
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .background(
                color = if (selected) {
                    AzfColors.SurfaceContainerHigh
                } else {
                    AzfColors.SurfaceContainerLow
                },
                shape = AzfShapes.Inner,
            )
            .border(width = if (selected) 2.dp else 1.dp, color = border, shape = AzfShapes.Inner)
            .selectable(
                selected = selected,
                role = Role.RadioButton,
                onClick = onClick,
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) AzfColors.PrimaryFixedDim else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp),
            )
            Spacer(modifier = Modifier.size(12.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * A consent checkbox. The whole row toggles, and the checkbox itself is
 * excluded from semantics so the row reads as one control with the consent
 * title as its name.
 */
@Composable
fun AzfConsentRow(
    title: String,
    body: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = onCheckedChange,
            )
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = CheckboxDefaults.colors(
                checkedColor = AzfColors.SecondaryContainer,
                checkmarkColor = AzfColors.Background,
                uncheckedColor = MaterialTheme.colorScheme.outline,
            ),
            modifier = Modifier.clearAndSetSemantics { },
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * A labelled switch inside a card. [enabled] false is used for the "the master
 * switch is off" case, where the choice is kept and shown but has no effect.
 */
@Composable
fun AzfSwitchRow(
    title: String,
    body: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (enabled) AzfColors.PrimaryFixedDim else MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(24.dp),
            )
            Spacer(modifier = Modifier.size(16.dp))
        }
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = AzfColors.Background,
                checkedTrackColor = AzfColors.PrimaryFixedDim,
                uncheckedThumbColor = MaterialTheme.colorScheme.outline,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceContainerLow,
            ),
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

/**
 * A row that goes somewhere. [trailingText] states the destination's current
 * value where there is one, so the row is informative before it is tapped.
 */
@Composable
fun AzfNavigationRow(
    title: String,
    body: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    trailing: ImageVector? = null,
    trailingDescription: String? = null,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .background(AzfColors.SurfaceContainerLow, RoundedCornerShape(16.dp))
            .selectable(
                selected = false,
                enabled = enabled,
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = AzfColors.PrimaryFixedDim,
                modifier = Modifier.size(24.dp),
            )
            Spacer(modifier = Modifier.size(16.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (trailing != null) {
            Spacer(modifier = Modifier.size(8.dp))
            Icon(
                imageVector = trailing,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(20.dp)
                    .then(
                        if (trailingDescription != null) {
                            Modifier.clearAndSetSemantics {
                                contentDescription = trailingDescription
                            }
                        } else {
                            Modifier
                        },
                    ),
            )
        }
    }
}

/** A small uppercase section heading, used across the settings stack. */
@Composable
fun AzfSectionHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(start = 4.dp),
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfFormControlsPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AzfSegmented(
                label = "Typical activity",
                options = listOf(
                    AzfSegmentOption("sedentary", "Sedentary"),
                    AzfSegmentOption("light", "Light"),
                    AzfSegmentOption("moderate", "Moderate"),
                ),
                selected = "light",
                onSelect = {},
                hint = "Light exercise 1–3 days a week.",
            )
            AzfOptionCard(
                title = "Lose weight",
                body = "A sustainable calorie deficit — never below safe floors.",
                selected = true,
                onClick = {},
            )
            AzfConsentRow(
                title = "Anonymised analytics",
                body = "Help improve the product.",
                checked = true,
                onCheckedChange = {},
            )
            AzfCard {
                AzfSwitchRow(
                    title = "All reminders",
                    body = "Master switch — stored with your consents.",
                    checked = true,
                    onCheckedChange = {},
                )
            }
            AzfNavigationRow(
                title = "Your plan",
                body = "Tier, daily AI credits and what each action costs.",
                onClick = {},
            )
        }
    }
}
