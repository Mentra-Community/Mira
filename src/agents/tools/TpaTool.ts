import { DynamicStructuredTool, DynamicTool, StructuredTool, tool, Tool } from '@langchain/core/tools';
import { z } from "zod";
import { AppI, ToolSchema, ToolCall } from '@mentra/sdk';
import axios, { AxiosError } from 'axios';


/**
 * Fetches all available tools for a specified package from the cloud service.
 *
 * @param cloudUrl - The URL of the cloud service
 * @param tpaPackageName - The name of the third-party application package
 * @returns A promise that resolves to an array of tool schemas
 * @throws AxiosError if the network request fails
 */

export async function getAllToolsForPackage(cloudUrl: string, tpaPackageName: string, actingUserId: string) {
  // Get the tools from the cloud
  const urlToGetTools = `${cloudUrl}/api/tools/apps/${tpaPackageName}/tools`;
  const response = await axios.get<ToolSchema[]>(urlToGetTools);
  const toolSchemas = response.data;

  // log tools
  for (const toolSchema of toolSchemas) {
    console.log(`Found tool: ${toolSchema.id}: ${toolSchema.description}`);
  }

  // Compile the tools
  const tools = toolSchemas.map(toolSchema => compileTool(cloudUrl, tpaPackageName, toolSchema, actingUserId));
  return tools;
}



/**
 * Compiles a third-party application tool schema into a LangChain DynamicStructuredTool.
 *
 * This function takes a tool schema from the cloud service and creates an executable
 * LangChain tool that can be used by AI agents. It handles parameter validation,
 * type conversion, and webhook communication with the TPA backend.
 *
 * @param cloudUrl - The base URL of the cloud service hosting the TPA tools
 * @param tpaPackageName - The package name of the third-party application
 * @param tpaTool - The tool schema containing metadata, parameters, and configuration
 * @param actingUserId - The ID of the user on whose behalf the tool will execute
 * @returns A LangChain DynamicStructuredTool ready for agent use
 *
 * @example
 * ```typescript
 * const weatherTool = compileTool(
 *   'https://api.example.com',
 *   'com.weather.app',
 *   {
 *     id: 'get-weather',
 *     description: 'Get current weather',
 *     parameters: {
 *       location: { type: 'string', required: true, description: 'City name' }
 *     }
 *   },
 *   'user123'
 * );
 * ```
 */
export function compileTool(cloudUrl: string, tpaPackageName: string, tpaTool: ToolSchema, actingUserId: string) {
  // Build Zod schema from tool parameter definitions
  // This converts the TPA tool schema into a format LangChain can validate
  const paramsSchema = tpaTool.parameters ? z.object(
    Object.entries(tpaTool.parameters).reduce((schema, [key, param]) => {
      // Create base Zod schema based on parameter type
      let fieldSchema;
      switch (param.type) {
        case 'string':
          fieldSchema = z.string().describe(param.description);
          // Handle enum constraints for string parameters
          if (param.enum && param.enum.length > 0) {
            fieldSchema = z.enum(param.enum as [string, ...string[]]).describe(param.description);
          }
          break;
        case 'number':
          fieldSchema = z.number().describe(param.description);
          break;
        case 'boolean':
          fieldSchema = z.boolean().describe(param.description);
          break;
        default:
          // Fallback for unknown parameter types
          fieldSchema = z.any().describe(param.description);
      }

      // Make parameter optional if not marked as required
      if (!param.required) {
        fieldSchema = fieldSchema.optional();
      }

      return { ...schema, [key]: fieldSchema };
    }, {})
  ) : undefined;

  // Enhance tool description with activation phrases for better AI understanding
  let description = tpaTool.description;
  if (tpaTool.activationPhrases && tpaTool.activationPhrases.length > 0) {
    description += "\nPossibly activated by phrases like: " + tpaTool.activationPhrases?.join(', ')
  }

  // Create the executable LangChain tool with async implementation
  return tool(
    async (input): Promise<string> => {
      // Build webhook endpoint URL for this specific TPA tool
      const webhookUrl = cloudUrl + `/api/tools/apps/${tpaPackageName}/tool`;

      // Handle different input formats - LangChain may pass strings or objects
      const params: any = typeof input === 'string' ? {} : input;

      // Construct payload matching the ToolCall interface requirements
      const payload: ToolCall = {
        toolId: tpaTool.id,
        toolParameters: params,
        timestamp: new Date(),
        userId: actingUserId,
        activeSession: null, // Set to null as no active session context is available
      }

      console.log(`[toolcall] Sending request to ${tpaTool.id} with params: ${JSON.stringify(params)}`);

      try {
        // Execute the tool by posting to the TPA webhook endpoint
        const response = await axios.post(webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 40000 // 40-second timeout for tool execution
        });

        console.log(`[toolcall] Response from ${tpaTool.id}: ${JSON.stringify(response.data)}`);
        return response.data;

      } catch (error) {
        // Comprehensive error handling with detailed logging
        if (axios.isAxiosError(error)) {
          // Handle timeout errors specifically
          if (error.code === 'ECONNABORTED') {
            console.error(`[toolcall] TPA tool request timed out for ${tpaTool.id}`);
            return `The request to ${tpaTool.id} timed out after 40 seconds. Please try again later.`;
          }

          // Handle HTTP and network errors
          console.error(`[toolcall] TPA tool request failed for ${tpaTool.id}: ${error.message}`);
          console.error(`[toolcall] Status: ${error.response?.status}`);
          console.error(`[toolcall] Response: ${JSON.stringify(error.response?.data)}`);
          return `Error executing ${tpaTool.id}: ${error.message}`;

        } else {
          // Handle unexpected errors
          const genericError = error as Error;
          console.error(`[toolcall] TPA tool execution error: ${genericError.message}`);
          return `Error executing ${tpaTool.id}: ${genericError.message || 'Unknown error'}`;
        }
      }
    },
    {
      name: tpaTool.id,
      description: description,
      schema: paramsSchema,
    }
  ) as DynamicStructuredTool<any>;
}

/**
 * Gets all installed apps for a user and retrieves all tools for each app.
 * This function requires proper authentication to be set up before calling.
 *
 * @returns A promise that resolves to an array of tools from all installed apps
 * @throws Error if authentication fails or if there are issues fetching apps/tools
 */
export async function getAllToolsForUser(cloudUrl: string, userId: string) {
  try {
    // Construct the URL to get all tools for the user
    const urlToGetUserTools = `${cloudUrl}/api/tools/users/${userId}/tools`;

    // Make the request to get all tools for the user
    const response = await axios.get<Array<ToolSchema & { appPackageName: string }>>(urlToGetUserTools);
    const userTools = response.data;

    // Log the tools found for the user
    console.log(`Found ${userTools.length} tools for user ${userId}`);

    // Compile all tools from all the user's installed apps
    const tools: DynamicStructuredTool<any>[] = [];

    for (const toolSchema of userTools) {
      console.log(`Processing tool: ${toolSchema.id} from app: ${toolSchema.appPackageName}`);

      // Compile each tool with its associated package name
      const compiledTool = compileTool(cloudUrl, toolSchema.appPackageName, toolSchema, userId);
      tools.push(compiledTool);
    }

    return tools;
  } catch (error) {
    // Handle errors appropriately
    if (axios.isAxiosError(error)) {
      console.error(`Failed to fetch tools for user ${userId}: ${error.message}`);
      console.error(`Status: ${error.response?.status}`);
      console.error(`Response: ${JSON.stringify(error.response?.data)}`);
    } else {
      console.error(`Error getting tools for user ${userId}: ${(error as Error).message}`);
    }

    // Return empty array on error to prevent application crashes
    return [];
  }
}