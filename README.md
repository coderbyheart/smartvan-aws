# SmartVan

![Test](https://github.com/coderbyheart/smartvan-aws/workflows/Test/badge.svg)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

AWS resources for
[SmartVan](https://github.com/coderbyheart?tab=repositories&q=smartvan&type=&language=).

## Deploy to AWS

Make these environment variable available:

> ℹ️ Linux users can use [direnv](https://direnv.net/) to simplify the process.

    export AWS_REGION=<...>
    export AWS_DEFAULT_REGION=<...>
    export AWS_ACCESS_KEY_ID=<Access Key ID of the service account>
    export AWS_SECRET_ACCESS_KEY=<Secret Access Key of the service account>

Install dependencies

    npm ci

Compile the source

    npx tsc

Set the ID of the stack

    export STACK_NAME="${STACK_NAME:-smartvan}"

Prepare the account for CDK resources:

    npx cdk -a 'node dist/cloudformation-sourcecode.js' deploy

Deploy the server stack to an AWS account

    npx cdk deploy ${STACK_NAME:-smartvan}

## Create a Thing for the SmartVan

Create a Thing and assign it to the `smartvan` group.

    mkdir certificates
    aws iot create-thing --thing-name smartvan
    aws iot add-thing-to-thing-group  --thing-group-name smartvan --thing-name smartvan
    aws iot create-keys-and-certificate --set-as-active > certificates/smartvan.json
    aws iot attach-thing-principal --thing-name smartvan --principal `cat certificates/smartvan.json | jq -r ".certificateArn"`
