import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { WildRydes } from "../../index";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { apiGatewayProxyEventStub } from "./events";

/**
 * Startup and shutdown timeout.
 */
const containerTimeout = 15 * 1000;
jest.setTimeout(5 * 1000 + 2 * containerTimeout);

describe("Unit test for app handler", () => {
  const emailAddress = "grace.hopper@your-company.de";
  const tableName = "Rides";
  let container: StartedTestContainer;
  let ddbClient: DynamoDBClient;

  beforeAll(async () => {
    container = await new GenericContainer("localstack/localstack:3.0.2")
    .withExposedPorts(4566)
    .withStartupTimeout(containerTimeout)
    .start();

    ddbClient = new DynamoDBClient({
      region: "eu-central-1",
      credentials: {
        accessKeyId: "000000000000",
        secretAccessKey: "test",
      },
      endpoint: `http://localhost:${container.getMappedPort(4566)}`,
    });

    await ddbClient.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          {
            AttributeName: "RideId",
            AttributeType: "S",
          },
        ],
        KeySchema: [
          {
            AttributeName: "RideId",
            KeyType: "HASH",
          },
        ],
      }),
    );
  });

  afterAll(async () => {
    await container.stop({ timeout: containerTimeout });
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

    const lambda = new WildRydes({ tableName: tableName, client: ddbClient });
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
