# AWS CDK アーキテクチャパターン集

よく使うアーキテクチャパターンのCDKコード例。
SKILL.mdのStep 3でコード生成する際の参考として使用する。

## 目次

1. [サーバーレスREST API](#1-サーバーレスrest-api)
2. [サーバーレスREST API（個別Lambda）](#2-サーバーレスrest-api個別lambda)
3. [静的サイト + CloudFront](#3-静的サイト--cloudfront)
4. [コンテナWebアプリ（ECS Fargate）](#4-コンテナwebアプリecs-fargate)
5. [イベント駆動処理](#5-イベント駆動処理)
6. [Step Functionsワークフロー](#6-step-functionsワークフロー)
7. [認証付きAPI（Cognito）](#7-認証付きapicognito)
8. [SQSキュー + Lambda](#8-sqsキュー--lambda)
9. [S3トリガー + Lambda](#9-s3トリガー--lambda)
10. [スケジュール実行](#10-スケジュール実行)
11. [VPC + RDS Aurora Serverless](#11-vpc--rds-aurora-serverless)
12. [WAF + CloudFront](#12-waf--cloudfront)

---

## 1. サーバーレスREST API

API Gateway + 単一Lambda + DynamoDB の最もシンプルなパターン。
小規模APIやプロトタイプに最適。

```typescript
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class ServerlessApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'ItemsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const handler = new nodejs.NodejsFunction(this, 'Handler', {
      entry: 'lambda/handler.ts',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    table.grantReadWriteData(handler);

    const api = new apigateway.LambdaRestApi(this, 'Api', {
      handler,
      proxy: false,
    });

    const items = api.root.addResource('items');
    items.addMethod('GET');
    items.addMethod('POST');
    items.addResource('{id}').addMethod('GET');

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
```

## 2. サーバーレスREST API（個別Lambda）

エンドポイントごとに個別のLambda関数を持つパターン。
関数ごとの権限分離、個別スケーリング、デプロイの独立性が必要な場合に使用。

```typescript
const api = new apigateway.RestApi(this, 'Api', {
  restApiName: 'Items Service',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
});

const listFn = new nodejs.NodejsFunction(this, 'ListFn', {
  entry: 'lambda/list.ts',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  environment: { TABLE_NAME: table.tableName },
});
table.grantReadData(listFn); // 読み取りのみ

const createFn = new nodejs.NodejsFunction(this, 'CreateFn', {
  entry: 'lambda/create.ts',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  environment: { TABLE_NAME: table.tableName },
});
table.grantWriteData(createFn); // 書き込みのみ

const items = api.root.addResource('items');
items.addMethod('GET', new apigateway.LambdaIntegration(listFn));
items.addMethod('POST', new apigateway.LambdaIntegration(createFn));
```

## 3. 静的サイト + CloudFront

S3 + CloudFront + OAC (Origin Access Control) パターン。

```typescript
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

const siteBucket = new s3.Bucket(this, 'SiteBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
  },
  defaultRootObject: 'index.html',
  errorResponses: [
    {
      httpStatus: 403,
      responseHttpStatus: 200,
      responsePagePath: '/index.html', // SPA向け
    },
  ],
});

new s3deploy.BucketDeployment(this, 'DeploySite', {
  sources: [s3deploy.Source.asset('./frontend/dist')],
  destinationBucket: siteBucket,
  distribution,
  distributionPaths: ['/*'],
});

new cdk.CfnOutput(this, 'DistributionUrl', {
  value: `https://${distribution.distributionDomainName}`,
});
```

## 4. コンテナWebアプリ（ECS Fargate）

ALB + ECS Fargate パターン。L3 パターンコンストラクト使用。

```typescript
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';

const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
  cluster,
  cpu: 256,
  memoryLimitMiB: 512,
  desiredCount: 2,
  taskImageOptions: {
    image: ecs.ContainerImage.fromAsset('./app'),
    containerPort: 3000,
    environment: {
      NODE_ENV: 'production',
    },
  },
  publicLoadBalancer: true,
  runtimePlatform: {
    cpuArchitecture: ecs.CpuArchitecture.ARM64,
    operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
  },
});

service.targetGroup.configureHealthCheck({
  path: '/health',
  healthyThresholdCount: 2,
});

const scaling = service.service.autoScaleTaskCount({ maxCapacity: 10 });
scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
});
```

## 5. イベント駆動処理

EventBridge + Lambda パターン。

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const bus = new events.EventBus(this, 'AppBus', {
  eventBusName: 'app-events',
});

const processFn = new nodejs.NodejsFunction(this, 'ProcessFn', {
  entry: 'lambda/process-order.ts',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
});

new events.Rule(this, 'OrderCreatedRule', {
  eventBus: bus,
  eventPattern: {
    source: ['app.orders'],
    detailType: ['OrderCreated'],
  },
  targets: [new targets.LambdaFunction(processFn)],
});
```

## 6. Step Functionsワークフロー

```typescript
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

const validateFn = new nodejs.NodejsFunction(this, 'ValidateFn', { /* ... */ });
const processFn = new nodejs.NodejsFunction(this, 'ProcessFn', { /* ... */ });

const validateTask = new tasks.LambdaInvoke(this, 'Validate', {
  lambdaFunction: validateFn,
  outputPath: '$.Payload',
});

const processTask = new tasks.LambdaInvoke(this, 'Process', {
  lambdaFunction: processFn,
  outputPath: '$.Payload',
});

const fail = new sfn.Fail(this, 'Fail', {
  cause: 'Validation failed',
});

const definition = validateTask
  .next(new sfn.Choice(this, 'IsValid?')
    .when(sfn.Condition.booleanEquals('$.isValid', true), processTask)
    .otherwise(fail));

new sfn.StateMachine(this, 'StateMachine', {
  definitionBody: sfn.DefinitionBody.fromChainable(definition),
  timeout: cdk.Duration.minutes(5),
});
```

## 7. 認証付きAPI（Cognito）

```typescript
import * as cognito from 'aws-cdk-lib/aws-cognito';

const userPool = new cognito.UserPool(this, 'UserPool', {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  autoVerify: { email: true },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
  },
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

const client = userPool.addClient('WebClient', {
  authFlows: { userSrp: true },
});

const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
  cognitoUserPools: [userPool],
});

api.root.addResource('protected').addMethod('GET',
  new apigateway.LambdaIntegration(handler), {
    authorizer,
    authorizationType: apigateway.AuthorizationType.COGNITO,
  },
);
```

## 8. SQSキュー + Lambda

```typescript
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

const dlq = new sqs.Queue(this, 'DLQ', {
  retentionPeriod: cdk.Duration.days(14),
});

const queue = new sqs.Queue(this, 'Queue', {
  visibilityTimeout: cdk.Duration.seconds(300),
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3,
  },
});

const processFn = new nodejs.NodejsFunction(this, 'ProcessFn', {
  entry: 'lambda/process.ts',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  timeout: cdk.Duration.seconds(60),
});

processFn.addEventSource(new lambdaEventSources.SqsEventSource(queue, {
  batchSize: 10,
  maxBatchingWindow: cdk.Duration.seconds(5),
}));
```

## 9. S3トリガー + Lambda

```typescript
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

const uploadBucket = new s3.Bucket(this, 'UploadBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

const processFn = new nodejs.NodejsFunction(this, 'ProcessFn', {
  entry: 'lambda/process-upload.ts',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  timeout: cdk.Duration.minutes(5),
});

uploadBucket.grantRead(processFn);
uploadBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(processFn),
  { prefix: 'uploads/', suffix: '.csv' },
);
```

## 10. スケジュール実行

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const cronFn = new nodejs.NodejsFunction(this, 'CronFn', {
  entry: 'lambda/cron.ts',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  timeout: cdk.Duration.minutes(15),
});

new events.Rule(this, 'DailyRule', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '9',     // UTC 9:00 = JST 18:00
  }),
  targets: [new targets.LambdaFunction(cronFn)],
});
```

## 11. VPC + RDS Aurora Serverless

```typescript
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

const vpc = new ec2.Vpc(this, 'Vpc', {
  maxAzs: 2,
  natGateways: 1, // 検証用: 0にしてコスト削減も可
});

const cluster = new rds.DatabaseCluster(this, 'Database', {
  engine: rds.DatabaseClusterEngine.auroraPostgres({
    version: rds.AuroraPostgresEngineVersion.VER_16_4,
  }),
  serverlessV2MinCapacity: 0.5,
  serverlessV2MaxCapacity: 4,
  writer: rds.ClusterInstance.serverlessV2('writer'),
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  removalPolicy: cdk.RemovalPolicy.DESTROY, // 検証用
  defaultDatabaseName: 'appdb',
});
```

## 12. WAF + CloudFront

```typescript
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

// WAF WebACL (us-east-1 に作成する必要あり for CloudFront)
const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
  scope: 'CLOUDFRONT',
  defaultAction: { allow: {} },
  visibilityConfig: {
    cloudWatchMetricsEnabled: true,
    metricName: 'WebAcl',
    sampledRequestsEnabled: true,
  },
  rules: [
    {
      name: 'AWSManagedRulesCommonRuleSet',
      priority: 1,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesCommonRuleSet',
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'CommonRuleSet',
        sampledRequestsEnabled: true,
      },
    },
    {
      name: 'RateLimitRule',
      priority: 2,
      action: { block: {} },
      statement: {
        rateBasedStatement: {
          limit: 2000,
          aggregateKeyType: 'IP',
        },
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'RateLimit',
        sampledRequestsEnabled: true,
      },
    },
  ],
});
```

## CDK init テンプレート

新規プロジェクト作成時のコマンド：

```bash
# TypeScript プロジェクトの初期化
mkdir my-cdk-project && cd my-cdk-project
npx cdk init app --language typescript

# 必要に応じてAlphaモジュールを追加
npm install @aws-cdk/aws-lambda-python-alpha
```
