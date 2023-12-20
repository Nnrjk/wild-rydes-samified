import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { WildRydes } from "../../index";
import { apiGatewayProxyEventStub } from "./events";

describe("Unit test for app handler", () => {
  const emailAddress = "grace.hopper@your-company.de";

  beforeAll(async () => {
    const mock = mockClient(DynamoDBDocumentClient);
    mock.on(PutCommand).resolves({
      Attributes: {
        RideId: "rideId",
        User: emailAddress,
        Unicorn: {
          Name: "unicornName",
          Color: "unicornColor",
          Gender: "unicornGender",
        },
        RequestTime: new Date("1995-12-17T03:24:00").toISOString(),
      },
    });
  });

  it("verifies successful response", async () => {
    const event: APIGatewayProxyEvent = {
      ...apiGatewayProxyEventStub,
      httpMethod: "post",
      body: JSON.stringify({ PickupLocation: { Latitude: 1.1, Longitude: 2.2 } }),
      path: "/ride",
      requestContext: {
        ...apiGatewayProxyEventStub.requestContext,
        accountId: "123456789012",
        apiId: "1234",
        authorizer: {
          claims: {
            "cognito:username": emailAddress,
          },
        },
      },
    };

    const lambda = new WildRydes({ tableName: "Rides" });
    const result: APIGatewayProxyResult = await lambda.handler(event, {} as Context);

    expect(result.statusCode).toEqual(201);

    expect(JSON.parse(result.body)).toMatchObject(
      expect.objectContaining({
        RideId: expect.any(String),
        Unicorn: expect.objectContaining({
          Name: expect.any(String),
          Color: expect.any(String),
          Gender: expect.any(String),
        }),
        Eta: expect.any(String),
        // match Rider for a string being an email address
        // Rider: expect.stringMatching(/^.+@.+\..+$/),
        Rider: emailAddress,
      }),
    );
  });
});
