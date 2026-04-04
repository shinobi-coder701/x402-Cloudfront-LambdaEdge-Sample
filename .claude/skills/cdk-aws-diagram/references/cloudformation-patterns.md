# CloudFormation テンプレートからのリソース抽出パターン

CDK L1 (CloudFormation 相当) の YAML テンプレートを解析する際の参照ガイド。

---

## ネットワークリソース

### VPC
```yaml
Type: AWS::EC2::VPC
Properties:
  CidrBlock: !Ref VpcCidr
```
→ VPC コンテナとして描画

### サブネット
```yaml
Type: AWS::EC2::Subnet
Properties:
  VpcId: !Ref OpenClawVPC
  MapPublicIpOnLaunch: true   # → パブリックサブネット
  # MapPublicIpOnLaunch: false → プライベートサブネット
```

### インターネットゲートウェイ
```yaml
Type: AWS::EC2::InternetGateway
```
→ VPC の入口として VPC コンテナの左端に配置

### VPCゲートウェイアタッチメント
```yaml
Type: AWS::EC2::VPCGatewayAttachment
Properties:
  VpcId: !Ref OpenClawVPC
  InternetGatewayId: !Ref OpenClawIGW
```
→ インターネットゲートウェイと VPC の関係を示す（矢印不要、位置で表現）

### VPCエンドポイント
```yaml
Type: AWS::EC2::VPCEndpoint
Properties:
  VpcEndpointType: Interface
  ServiceName: com.amazonaws.us-east-1.bedrock-runtime
  Condition: CreateEndpoints  # → 条件付き（点線 + オプション注記）
```
→ プライベートサブネット内に配置。条件があれば「(VPCエンドポイント有効時)」と注記

---

## セキュリティリソース

### セキュリティグループ
```yaml
Type: AWS::EC2::SecurityGroup
Properties:
  GroupDescription: OpenClaw EC2 Security Group
  SecurityGroupIngress:
    - IpProtocol: tcp
      FromPort: 22
      ToPort: 22
      CidrIp: !Ref AllowedSSHCIDR
      # Condition: AllowSSH → 条件付きルール
  SecurityGroupEgress:
    - IpProtocol: -1   # 全トラフィック許可
```
→ EC2 を包むコンテナとして描画。インバウンドルールをラベルで記載

### IAMロール
```yaml
Type: AWS::IAM::Role
Properties:
  ManagedPolicyArns:
    - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore  # → SSM接続矢印
    - arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy    # → CloudWatch矢印
  Policies:
    - PolicyDocument:
        Statement:
          - Action:
              - bedrock:InvokeModel                        # → Bedrock矢印
              - bedrock:InvokeModelWithResponseStream
            Effect: Allow
          - Action:
              - ssm:PutParameter                           # → SSM Parameter Store矢印
              - ssm:GetParameter
            Effect: Allow
```

---

## コンピュートリソース

### EC2インスタンス
```yaml
Type: AWS::EC2::Instance
Properties:
  SubnetId: !Ref OpenClawPublicSubnet    # → どのサブネットに配置するか
  SecurityGroupIds:
    - !Ref OpenClawSecurityGroup          # → どのSGに属するか
  IamInstanceProfile: !Ref OpenClawInstanceProfile  # → IAMロールのアタッチ
  ImageId: !If [UseGraviton, ami-xxx, ami-yyy]
  InstanceType: !Ref InstanceType
  UserData: ...                           # → EC2内で動くアプリケーションの注記
```

---

## 条件式の解析

### Conditions ブロック
```yaml
Conditions:
  CreateEndpoints: !Equals [!Ref CreateVPCEndpoints, "true"]
  AllowSSH: !Not [!Equals [!Ref AllowedSSHCIDR, "127.0.0.1/32"]]
  UseGraviton: !Or [...]
```

条件付きリソースの識別：
```yaml
SomeResource:
  Type: AWS::EC2::VPCEndpoint
  Condition: CreateEndpoints   # ← この行があれば条件付き
```

→ 図中では点線または「(オプション)」と注記する

---

## WaitCondition（省略可）

```yaml
Type: AWS::CloudFormation::WaitCondition
```
→ デプロイメカニズムのため図への記載は不要。省略する。

---

## よくある参照パターン

| YAML 参照 | 意味 | 図への反映 |
|-----------|------|-----------|
| `VpcId: !Ref OpenClawVPC` | VPC内のリソース | VPC コンテナの中に配置 |
| `SubnetId: !Ref OpenClawPublicSubnet` | サブネット内のリソース | サブネットコンテナの中に配置 |
| `SecurityGroupIds: [!Ref sg]` | SGを使用 | SGコンテナの中に配置 |
| `IamInstanceProfile: !Ref profile` | IAMロールを使用 | IAMロール → EC2 の矢印（点線） |
| `VpcId: !GetAtt vpc.VpcId` | VPC参照 | VPC コンテナに含める |
