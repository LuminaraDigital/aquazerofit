package fit.aquazero.app.feature.coach

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.database.ChatMessageEntity
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme

@Composable
fun CoachScreen(
    modifier: Modifier = Modifier,
    viewModel: CoachViewModel = hiltViewModel(),
) {
    val messages by viewModel.messages.collectAsState()
    val isStreaming by viewModel.isStreaming.collectAsState()
    val streamingText by viewModel.streamingText.collectAsState()

    CoachContent(
        messages = messages,
        isStreaming = isStreaming,
        streamingText = streamingText,
        onSendMessage = viewModel::sendMessage,
        modifier = modifier
    )
}

@Composable
fun CoachContent(
    messages: List<ChatMessageEntity>,
    isStreaming: Boolean,
    streamingText: String,
    onSendMessage: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var inputText by remember { mutableStateOf("") }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_coach).uppercase(), onBack = null)
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(AzfSpacing.ContainerPadding),
                reverseLayout = true
            ) {
                if (isStreaming && streamingText.isNotEmpty()) {
                    item {
                        ChatBubble(
                            content = streamingText,
                            isAssistant = true,
                            isStreaming = true
                        )
                    }
                }
                items(messages.reversed(), key = { it.id }) { message ->
                    ChatBubble(
                        content = message.content,
                        isAssistant = message.role == "assistant"
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(AzfSpacing.ContainerPadding),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AzfTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    label = "Ask Akin...",
                    modifier = Modifier.weight(1f),
                    enabled = !isStreaming
                )
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(
                    onClick = {
                        if (inputText.isNotBlank()) {
                            onSendMessage(inputText)
                            inputText = ""
                        }
                    },
                    enabled = !isStreaming && inputText.isNotBlank()
                ) {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = "Send",
                        tint = if (isStreaming) MaterialTheme.colorScheme.outline else AzfColors.PrimaryFixedDim
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun CoachPreview() {
    AzfTheme {
        CoachContent(
            messages = listOf(
                ChatMessageEntity(
                    id = "1",
                    sessionId = "s1",
                    role = "user",
                    content = "How much water should I drink today?",
                    createdAt = ""
                ),
                ChatMessageEntity(
                    id = "2",
                    sessionId = "s1",
                    role = "assistant",
                    content = "Based on your activity level and the current temperature, I recommend drinking 2.5 liters today.",
                    createdAt = ""
                )
            ),
            isStreaming = false,
            streamingText = "",
            onSendMessage = {}
        )
    }
}


@Composable
private fun ChatBubble(
    content: String,
    isAssistant: Boolean,
    isStreaming: Boolean = false,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        contentAlignment = if (isAssistant) Alignment.CenterStart else Alignment.CenterEnd
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isAssistant) 4.dp else 16.dp,
                        bottomEnd = if (isAssistant) 16.dp else 4.dp
                    )
                )
                .background(
                    if (isAssistant) MaterialTheme.colorScheme.surfaceContainer
                    else AzfColors.PrimaryFixedDim.copy(alpha = 0.2f)
                )
                .padding(12.dp)
        ) {
            Text(
                text = content,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (isStreaming) {
                Text(
                    text = "Akin is typing...",
                    style = MaterialTheme.typography.labelSmall,
                    color = AzfColors.PrimaryFixedDim,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}
