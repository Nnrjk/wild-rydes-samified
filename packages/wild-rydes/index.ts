import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { randomBytes } from "node:crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

type Payload = {
  Latitude: number;
  Longitude: number;
};

type FileItem = {
  Name: string;
  Color: string;
  Gender: string;
};

const fleet: FileItem[] = [
  {
    Name: "Angel",
    Color: "White",
    Gender: "Female",
  },
  {
    Name: "Gil",
    Color: "White",
    Gender: "Male",
  },
  {
    Name: "Rocinante",
    Color: "Yellow",
    Gender: "Female",
  },
];

export class WildRydes {
  #tableName;
  #ddbDocClient;

  constructor(params: { tableName?: string; client?: DynamoDBClient }) {
    this.#tableName = params.tableName ?? process.env.DYNAMO_TABLE;
    const client = params.client ?? new DynamoDBClient();
    this.#ddbDocClient = DynamoDBDocumentClient.from(client);
  }

  async handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    if (!event.requestContext.authorizer) {
      console.error("Authorization not configured");
      return {
        statusCode: 500,
        body: JSON.stringify({
          Error: "Authorization not configured",
          Reference: context.awsRequestId,
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    const rideId = this.toUrlString(randomBytes(16));
    console.debug("Received event (", rideId, "): ", event);

    // Because we're using a Cognito User Pools authorizer, all of the claims
    // included in the authentication token are provided in the request context.
    // This includes the username as well as other attributes.
    const username = event.requestContext.authorizer.claims["cognito:username"];

    // The body field of the event in a proxy integration is a raw string.
    // In order to extract meaningful values, we need to first parse this string
    // into an object. A more robust implementation might inspect the Content-Type
    // header first and use a different parsing strategy based on that value.
    const requestBody = JSON.parse(event.body as string);

    const pickupLocation = requestBody.PickupLocation;

    try {
      const unicorn = this.findUnicorn(pickupLocation);
      await this.recordRide(rideId, username, unicorn);

      return {
        statusCode: 201,
        body: JSON.stringify({
          RideId: rideId,
          Unicorn: unicorn,
          Eta: "30 seconds",
          Rider: username,
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    } catch (error: unknown) {
      console.error(error);

      // If there is an error during processing, catch it and return
      // from the Lambda function successfully. Specify a 500 HTTP status
      // code and provide an error message in the body. This will provide a
      // more meaningful error response to the end client.
      if (error instanceof Error) {
        console.error("Error during processing");
        return {
          statusCode: 500,
          body: JSON.stringify({
            Error: error.message,
            Reference: context.awsRequestId,
          }),
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        };
      } else {
        return {
          statusCode: 500,
          body: JSON.stringify({
            Error: "any error",
            Reference: context.awsRequestId,
          }),
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    }
  }

  /**
   * This is where you would implement logic to find the optimal unicorn for
   * this ride (possibly invoking another Lambda function as a microservice.)
   * For simplicity, we'll just pick a unicorn at random.
   */
  private findUnicorn(pickupLocation: Payload): FileItem {
    console.log("Finding unicorn for ", pickupLocation.Latitude, ", ", pickupLocation.Longitude);
    return fleet[Math.floor(Math.random() * fleet.length)];
  }

  private async recordRide(rideId: string, username: string, unicorn: FileItem) {
    const command = new PutCommand({
      TableName: this.#tableName,
      Item: {
        RideId: rideId,
        User: username,
        Unicorn: unicorn,
        RequestTime: new Date().toISOString(),
      },
    });

    return await this.#ddbDocClient.send(command);
  }

  private toUrlString(buffer: Buffer) {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
}

const lambda = new WildRydes({});
export const lambdaHandler = lambda.handler.bind(lambda);
