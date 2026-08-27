package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Deep Sea input: semi-transparent navy fill, 16dp radius, aqua glow on
 * focus, error slot below (DESIGN.md input recipe).
 */
@Composable
fun AzfTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    isPassword: Boolean = false,
    error: String? = null,
    enabled: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    singleLine: Boolean = true,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            isError = error != null,
            singleLine = singleLine,
            keyboardOptions = keyboardOptions,
            visualTransformation =
                if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            shape = AzfShapes.Inner,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = LocalAzfExtended.current.primaryFixedDim,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                focusedLabelColor = LocalAzfExtended.current.primaryFixedDim,
            ),
        )
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(start = 4.dp, top = 4.dp),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfTextFieldPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            AzfTextField(value = "swim@aquazero.fit", onValueChange = {}, label = "Email")
            AzfTextField(
                value = "",
                onValueChange = {},
                label = "Password",
                isPassword = true,
                error = "Password must include a digit",
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}
