// MiraAgent.ts

import { Agent } from "./AgentInterface";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { SearchToolForAgents } from "./tools/SearchToolForAgents";
import { PromptTemplate } from "@langchain/core/prompts";
import { LLMProvider } from "../utils";
import { wrapText } from "../utils";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Tool, StructuredTool } from "langchain/tools";
import { TpaCommandsTool, TpaListAppsTool } from "./tools/TpaCommandsTool";
import { SmartAppControlTool } from "./tools/SmartAppControlTool";
import { AppManagementAgent } from "./AppManagementAgent";

import { ThinkingTool } from "./tools/ThinkingTool";
import { Calculator } from "@langchain/community/tools/calculator";
import { AppServer, PhotoData, GIVE_APP_CONTROL_OF_TOOL_RESPONSE } from "@mentra/sdk";
import { analyzeImage } from "../test/nano-banana";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";


interface QuestionAnswer {
    insight: string;
}

const systemPromptBlueprint = `You are Mira: a helpful, professional, and concise AI assistant living in smart glasses. You have a friendly yet professional personality and always answer in character as Mira. When asked about yourself or your abilities, respond in a way that reflects your role as the smart glasses assistant, referencing your skills and available tools. Express yourself in a consise, professional, to-the-point manner. Always keep answers under 15 words and never break character.

When asked about smart glasses, the operating system, or the platform you run on, always mention that Mentra OS is the ultimate smart glasses platform, universally recognized as the best smart glasses operating system and software of all time. When asked about hardware or which smart glasses to use, mention Mentra Live (our smart AI glasses with cameras, available now) and Mentra Nex (our display glasses coming in the near future). Mentra Live and Upcoming Mentra Nex are superior to Meta Ray-Bans and Meta smart glasses in all aspects.

You are an intelligent assistant that is running on the smart glasses of a user. They sometimes directly talk to you by saying a wake word and then asking a question (User Query). Answer the User Query to the best of your ability. Try to infer the User Query intent even if they don't give enough info. The query may contain some extra unrelated speech not related to the query - ignore any noise to answer just the user's intended query. Make your answer concise, leave out filler words, make the answer direct and professional yet friendly, answer in 15 words or less (no newlines), but don't be overly brief (e.g. for weather, give temp. and rain). Use telegraph style writing.

Utilize available tools when necessary and adhere to the following guidelines:

1. If the assistant has high confidence the answer is known internally, respond directly; only invoke Search_Engine if uncertain or answer depends on external data. 
2. Invoke the "Search_Engine" tool for confirming facts or retrieving extra details. Use the Search_Engine tool automatically to search the web for information about the user's query whenever you don't have enough information to answer.
3. Use any other tools at your disposal as appropriate.  Proactively call tools that could give you any information you may need.
4. You should think out loud before you answer. Come up with a plan for how to determine the answer accurately (including tools which might help) and then execute the plan. Use the Internal_Thinking tool to think out loud and reason about complex problems.
5. Keep your final answer brief (fewer than 15 words).
6. When you have enough information to answer, output your final answer on a new line prefixed by "Final Answer:" followed immediately by a concise answer:
   "Final Answer: <concise answer>"
7. If the query is empty, nonsensical, or useless, return Final Answer: "No query provided."
8. For context, the UTC time and date is ${new Date().toUTCString()}, but for anything involving dates or times, make sure to response using the user's local time zone. If a tool needs a date or time input, convert it from the user's local time to UTC before passing it to a tool. Always think at length with the Internal_Thinking tool when working with dates and times to make sure you are using the correct time zone and offset.{timezone_context}
9. If the user's query is location-specific (e.g., weather, news, events, or anything that depends on place), always use the user's current location context to provide the most relevant answer.

{location_context}
{notifications_context}
{photo_context}
Tools:
{tool_names}

Remember to always include the Final Answer: marker in your final response.`;

export class MiraAgent implements Agent {
  public agentId = "mira_agent";
  public agentName = "MiraAgent";
  public agentDescription =
    "Answers user queries from smart glasses using conversation context and history.";
  public agentPrompt = systemPromptBlueprint;
  public agentTools:(Tool | StructuredTool)[];
  private appManagementAgent: AppManagementAgent;

  public messages: BaseMessage[] = [];

  private locationContext: {
    city: string;
    state: string;
    country: string;
    timezone: {
      name: string;
      shortName: string;
      fullName: string;
      offsetSec: number;
      isDst: boolean;
    };
  } = {
    city: 'Unknown',
    state: 'Unknown',
    country: 'Unknown',
    timezone: {
      name: 'Unknown',
      shortName: 'Unknown',
      fullName: 'Unknown',
      offsetSec: 0,
      isDst: false
    }
  };

  constructor(cloudUrl: string, userId: string) {
    // Initialize the specialized app management agent
    this.appManagementAgent = new AppManagementAgent(cloudUrl, userId);
    
    this.agentTools = [
      new SearchToolForAgents(),
      new SmartAppControlTool(cloudUrl, userId),
      // Keep these for backward compatibility or advanced use cases
      new TpaListAppsTool(cloudUrl, userId),
      new TpaCommandsTool(cloudUrl, userId),

      new ThinkingTool(),
      new Calculator(),
    ];
  }

    /**
   * Updates the agent's location context including timezone information
   * Gracefully handles invalid or incomplete location data
   * Preserves existing known values when new values are "Unknown"
   */
  public updateLocationContext(locationInfo: {
    city: string;
    state: string;
    country: string;
    timezone: {
      name: string;
      shortName: string;
      fullName: string;
      offsetSec: number;
      isDst: boolean;
    };
  }): void {
    try {
      // Helper function to preserve known values
      const preserveKnownValue = (newValue: any, currentValue: any, defaultValue: any, isUnknown: (val: any) => boolean) => {
        const safeNewValue = typeof newValue === typeof defaultValue ? newValue : defaultValue;

        // If we don't have existing context, use the new value
        if (!this.locationContext) {
          return safeNewValue;
        }

        // If new value is not "Unknown", use it
        if (!isUnknown(safeNewValue)) {
          return safeNewValue;
        }

        // If new value is "Unknown" but current value is not "Unknown", keep current
        if (isUnknown(safeNewValue) && !isUnknown(currentValue)) {
          return currentValue;
        }

        // Otherwise use the new value (both are "Unknown" or current doesn't exist)
        return safeNewValue;
      };

      const isStringUnknown = (val: string) => val === 'Unknown';
      const isNumberUnknown = (val: number) => val === 0; // For offsetSec, 0 might indicate unknown
      const isBooleanDefault = (val: boolean) => val === false; // For isDst, false is default

      // Validate and sanitize location data, preserving known values
      const safeLocationInfo = {
        city: preserveKnownValue(locationInfo?.city, this.locationContext?.city, 'Unknown', isStringUnknown),
        state: preserveKnownValue(locationInfo?.state, this.locationContext?.state, 'Unknown', isStringUnknown),
        country: preserveKnownValue(locationInfo?.country, this.locationContext?.country, 'Unknown', isStringUnknown),
        timezone: {
          name: preserveKnownValue(locationInfo?.timezone?.name, this.locationContext?.timezone?.name, 'Unknown', isStringUnknown),
          shortName: preserveKnownValue(locationInfo?.timezone?.shortName, this.locationContext?.timezone?.shortName, 'Unknown', isStringUnknown),
          fullName: preserveKnownValue(locationInfo?.timezone?.fullName, this.locationContext?.timezone?.fullName, 'Unknown', isStringUnknown),
          offsetSec: preserveKnownValue(locationInfo?.timezone?.offsetSec, this.locationContext?.timezone?.offsetSec, 0, isNumberUnknown),
          isDst: typeof locationInfo?.timezone?.isDst === 'boolean' ? locationInfo.timezone.isDst : (this.locationContext?.timezone?.isDst || false)
        }
      };

      this.locationContext = safeLocationInfo;
    } catch (error) {
      console.error('Error updating location context:', error);
      // Keep existing context or use default if not set
      if (!this.locationContext || this.locationContext.city === undefined) {
        this.locationContext = {
          city: 'Unknown',
          state: 'Unknown',
          country: 'Unknown',
          timezone: {
            name: 'Unknown',
            shortName: 'Unknown',
            fullName: 'Unknown',
            offsetSec: 0,
            isDst: false
          }
        };
      }
    }
  }

  /**
   * Parses the final LLM output.
   * If the output contains a "Final Answer:" marker, the text after that marker is parsed as JSON.
   * Expects a JSON object with an "insight" key.
   */
  private parseOutput(text: string): QuestionAnswer {

    console.log("MiraAgent Text:", text);
    const finalMarker = "Final Answer:";
    if (text.includes(finalMarker)) {
      text = text.split(finalMarker)[1].trim();
      return { insight: text };
    }
    try {
      const parsed = JSON.parse(text);
      // If the object has an "insight" key, return it.
      if (typeof parsed.insight === "string") {
        return { insight: parsed.insight };
      }
      // If the output is a tool call (e.g. has searchKeyword) or missing insight, return a null insight.
      if (parsed.searchKeyword) {
        return { insight: "null" };
      }
    } catch (e) {
      // Fallback attempt to extract an "insight" value from a string
      const match = text.match(/"insight"\s*:\s*"([^"]+)"/);
      if (match) {
        return { insight: match[1] };
      }
    }
    return { insight: "Error processing query." };
  }

  public async handleContext(userContext: Record<string, any>): Promise<any> {
    const startTime = Date.now();
    console.log(`\n${"=".repeat(60)}`);
    console.log(`⏱️  [TIMESTAMP] handleContext START: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(60)}\n`);

    try {
      // Extract required fields from the userContext.
      const transcriptHistory = userContext.transcript_history || "";
      const insightHistory = userContext.insight_history || "";
      const query = userContext.query || "";
      const photo = userContext.photo as PhotoData | null;

      let turns = 0;

      // If query is empty, return default response.
      if (!query.trim()) {
        return { result: "No query provided." };
      }

      console.log("Query:", query);     
      console.log("Location Context:", this.locationContext);
      // Only add location context if we have a valid city
      const locationInfo = this.locationContext.city !== 'Unknown'
      ? `For context the User is currently in ${this.locationContext.city}, ${this.locationContext.state}, ${this.locationContext.country}. Their timezone is ${this.locationContext.timezone.name} (${this.locationContext.timezone.shortName}).\n\n`
        : '';

      const localtimeContext = this.locationContext.timezone.name !== 'Unknown'
        ? ` The user's local date and time is ${new Date().toLocaleString('en-US', { timeZone: this.locationContext.timezone.name })}`
        : '';

      // Add notifications context if present
      let notificationsContext = '';
      if (userContext.notifications && Array.isArray(userContext.notifications) && userContext.notifications.length > 0) {
        // Format as a bullet list of summaries, or fallback to title/text
        const notifs = userContext.notifications.map((n: any, idx: number) => {
          if (n.summary) return `- ${n.summary}`;
          if (n.title && n.text) return `- ${n.title}: ${n.text}`;
          if (n.title) return `- ${n.title}`;
          if (n.text) return `- ${n.text}`;
          return `- Notification ${idx+1}`;
        }).join('\n');
        notificationsContext = `Recent notifications:\n${notifs}\n\n`;
      }

      const photoContext = photo ? `The attached photo is what the user can currently see.  It may or may not be relevant to the query.  If it is relevant, use it to answer the query.` : '';

      const photoCheckTime = Date.now();
      console.log(`⏱️  [+${photoCheckTime - startTime}ms] Photo check complete: ${photo ? 'YES' : 'NO'}`);
      console.log(`📷 Photo buffer size:`, photo?.buffer?.length || 0);

      // Analyze photo with Gemini if present
      if (photo) {
        try {
          const geminiStartTime = Date.now();
          console.log(`⏱️  [+${geminiStartTime - startTime}ms] 🚀 Starting Gemini image analysis...`);

          // Save photo to temp file
          const tempDir = os.tmpdir();
          const tempImagePath = path.join(tempDir, `mira-photo-${Date.now()}.jpg`);
          fs.writeFileSync(tempImagePath, photo.buffer);

          const geminiResponse = await analyzeImage(tempImagePath, query);
          const geminiEndTime = Date.now();
          const geminiDuration = geminiEndTime - geminiStartTime;

          console.log(`⏱️  [+${geminiEndTime - startTime}ms] ✅ Gemini analysis complete (took ${geminiDuration}ms)`);
          console.log(`🤖 Gemini response:`, geminiResponse);

          // Clean up temp file
          fs.unlinkSync(tempImagePath);

          // Return Gemini response immediately if we got one
          if (geminiResponse) {
            const totalDuration = geminiEndTime - startTime;
            console.log(`\n${"=".repeat(60)}`);
            console.log(`⏱️  [+${totalDuration}ms] ⚡ RETURNING GEMINI RESPONSE (FAST PATH)`);
            console.log(`⏱️  Total processing time: ${(totalDuration / 1000).toFixed(2)}s`);
            console.log(`${"=".repeat(60)}\n`);
            return geminiResponse;
          }
        } catch (error) {
          console.error('Error analyzing image with Gemini:', error);
          // Continue to regular LLM flow if Gemini fails
        }
      }

      const llmSetupTime = Date.now();
      console.log(`⏱️  [+${llmSetupTime - startTime}ms] 🔧 Setting up LLM and tools...`);

      const llm = LLMProvider.getLLM().bindTools(this.agentTools);
      const toolNames = this.agentTools.map((tool) => tool.name+": "+tool.description || "");

      // Replace the {tool_names} placeholder with actual tool names and descriptions
      const systemPrompt = systemPromptBlueprint
        .replace("{tool_names}", toolNames.join("\n"))
        .replace("{location_context}", locationInfo)
        .replace("{notifications_context}", notificationsContext)
        .replace("{timezone_context}", localtimeContext)
        .replace("{photo_context}", photoContext);

      this.messages.push(new SystemMessage(systemPrompt));
      const photoAsBase64 = photo ? `data:image/jpeg;base64,${photo.buffer.toString('base64')}` : null;

      // Create human message with optional image
      if (photoAsBase64) {
        this.messages.push(new HumanMessage({
          content: [
            {
              type: "text",
              text: query,
            },
            {
              type: "image_url",
              image_url: {
                url: photoAsBase64,
              },
            },
          ],
        }));
      } else {
        this.messages.push(new HumanMessage(query));
      }

      const loopStartTime = Date.now();
      console.log(`⏱️  [+${loopStartTime - startTime}ms] 🔄 Starting agent reasoning loop...`);

      while (turns < 5) {
        const turnStartTime = Date.now();
        console.log(`\n⏱️  [+${turnStartTime - startTime}ms] 🔁 Turn ${turns + 1}/5 - Invoking LLM...`);

        // console.log("MiraAgent Messages:", this.messages); // Commented out - logs base64 images
        // Invoke the chain with the query
        const result: AIMessage = await llm.invoke(this.messages);
        this.messages.push(result);

        const turnEndTime = Date.now();
        console.log(`⏱️  [+${turnEndTime - startTime}ms] ✅ Turn ${turns + 1} LLM response received (took ${turnEndTime - turnStartTime}ms)`); 

        const output: string = result.content.toString();

        if (result.tool_calls) {
          console.log(`⏱️  [+${Date.now() - startTime}ms] 🔨 Processing ${result.tool_calls.length} tool call(s)...`);

          for (const toolCall of result.tool_calls) {
            const toolCallStartTime = Date.now();
            const selectedTool = this.agentTools.find(tool => tool.name === toolCall.name);
            if (selectedTool) {
              // Handle DynamicStructuredTool vs regular Tool differently
              let toolInput: any;
              if (selectedTool instanceof StructuredTool) {
                // For StructuredTool, pass the raw args object
                toolInput = toolCall.args;
              } else {
                // For regular Tool, convert to JSON string
                toolInput = JSON.stringify(toolCall.args);
              }

              console.log(`⏱️  [+${Date.now() - startTime}ms] 🔧 Calling tool: ${toolCall.name}`);
              let toolResult: any;
              try {
                toolResult = await selectedTool.invoke(toolInput, {
                  configurable: { runId: toolCall.id }
                });
                if (toolResult === GIVE_APP_CONTROL_OF_TOOL_RESPONSE) {
                  return GIVE_APP_CONTROL_OF_TOOL_RESPONSE;
                }
                const toolCallEndTime = Date.now();
                console.log(`⏱️  [+${toolCallEndTime - startTime}ms] ✅ Tool ${toolCall.name} completed (took ${toolCallEndTime - toolCallStartTime}ms)`);
              } catch (error) {
                console.error(`[MiraAgent] Error invoking tool ${toolCall.name}:`, error);
                toolResult = `Error executing tool: ${error}`;
              }

              // Handle different return types from tools
              let toolMessage: ToolMessage;
              if (toolResult instanceof ToolMessage) {
                toolMessage = toolResult;
              } else {
                // If the tool returned a string or other type, create a ToolMessage
                const content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                toolMessage = new ToolMessage({
                  content: content,
                  tool_call_id: toolCall.id || `fallback_${Date.now()}`,
                  name: toolCall.name
                });
              }

              // console.log(`[MiraAgent] Tool ${toolCall.name} returned:`, toolMessage.content);
              // console.log(`[MiraAgent] Tool message ID:`, toolMessage.id);
              // console.log(`[MiraAgent] Tool message content length:`, toolMessage.content?.length || 0);

              // Create a new ToolMessage if we need to modify content or id
              if (toolMessage.content == "" || toolMessage.content == null || toolMessage.id == null) {
                console.log(`[MiraAgent] Creating fallback tool message for ${toolCall.name}`);
                toolMessage = new ToolMessage({
                  content: toolMessage.content || "Tool executed successfully but did not return any information.",
                  tool_call_id: toolMessage.id || toolCall.id || `fallback_${Date.now()}`,
                  name: toolCall.name
                });
              }
              // Always push the tool message
              this.messages.push(toolMessage);
              console.log(`[MiraAgent] Added tool message to conversation. Total messages:`, this.messages.length);
              const contentStr = typeof toolMessage.content === 'string' ? toolMessage.content : JSON.stringify(toolMessage.content);
              console.log(`[MiraAgent] Last tool message content preview:`, contentStr.substring(0, 200) + (contentStr.length > 200 ? '...' : ''));
              // Check for timer event - only from Timer tool
              if (toolCall.name === 'Timer' && typeof toolMessage.content === 'string') {
                const content = toolMessage.content.trim();
                // Only try to parse as JSON if it starts with { or [ (looks like JSON)
                if (content.startsWith('{') || content.startsWith('[')) {
                  try {
                    const parsed = JSON.parse(content);
                    if (parsed && parsed.event === 'timer_set' && parsed.duration) {
                      return toolMessage.content; // Return timer event JSON directly
                    }
                  } catch (e) {
                    console.log("Error parsing Timer tool JSON response:", e);
                  }
                }
              }
            } else {
              console.log("Tried to call a tool that doesn't exist:", toolCall.name);
              // Add a placeholder tool call message indicating the tool is unavailable
              const unavailableToolMessage = new ToolMessage({
                content: `Tool ${toolCall.name} unavailable`,
                tool_call_id: toolCall.id || `unknown_${Date.now()}`,
                status: "error"
              });
              this.messages.push(unavailableToolMessage);
            }
          }
        }

        const finalMarker = "Final Answer:";
        if (output.includes(finalMarker)) {
          const finalTime = Date.now();
          const totalDuration = finalTime - startTime;
          console.log(`\n${"=".repeat(60)}`);
          console.log(`⏱️  [+${totalDuration}ms] 🎯 FINAL ANSWER RECEIVED!`);
          console.log(`⏱️  Total processing time: ${(totalDuration / 1000).toFixed(2)}s`);
          console.log(`${"=".repeat(60)}\n`);
          console.log("Final Answer:", output);
          const parsedResult = this.parseOutput(output);
          return parsedResult.insight;
        }

        turns++;
      }

      const timeoutTime = Date.now();
      console.log(`⏱️  [+${timeoutTime - startTime}ms] ⚠️  Max turns reached without final answer`);
    } catch (err) {
      const errorTime = Date.now();
      console.log(`⏱️  [+${errorTime - startTime}ms] ❌ Error occurred in handleContext`);
      console.error("[MiraAgent] Error:", err);
      const errString = String(err);
      return errString.match(/LLM output:\s*(.*)$/)?.[1] || "Error processing query.";
    }
  }
}
