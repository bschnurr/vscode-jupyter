// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

/* eslint-disable  */

import { assert, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from '../../../platform/vscode-path/path';
import { IFileSystemNode } from '../../../platform/common/platform/types.node';
import { EnvironmentVariablesService } from '../../../platform/common/variables/environment.node';
import { ICustomEnvironmentVariablesProvider } from '../../../platform/common/variables/types';
import { IEnvironmentActivationService } from '../../../platform/interpreter/activation/types';
import { IInterpreterService } from '../../../platform/interpreter/contracts';
import { EnvironmentType, PythonEnvironment } from '../../../platform/pythonEnvironments/info';
import { anything, instance, mock, when } from 'ts-mockito';
import { KernelEnvironmentVariablesService } from '../../../kernels/raw/launcher/kernelEnvVarsService.node';
import { IJupyterKernelSpec } from '../../../kernels/types';
import { Uri } from 'vscode';
import { IConfigurationService, IWatchableJupyterSettings } from '../../../platform/common/types';
import { JupyterSettings } from '../../../platform/common/configSettings';

use(chaiAsPromised);

suite('Kernel Environment Variables Service', () => {
    let fs: IFileSystemNode;
    let envActivation: IEnvironmentActivationService;
    let customVariablesService: ICustomEnvironmentVariablesProvider;
    let variablesService: EnvironmentVariablesService;
    let kernelVariablesService: KernelEnvironmentVariablesService;
    let interpreterService: IInterpreterService;
    let configService: IConfigurationService;
    let settings: IWatchableJupyterSettings;
    const pathFile = Uri.joinPath(Uri.file('foobar'), 'bar');
    const interpreter: PythonEnvironment = {
        envType: EnvironmentType.Conda,
        uri: pathFile,
        sysPrefix: '0'
    };
    let kernelSpec: IJupyterKernelSpec;
    const originalEnvVars = Object.assign({}, process.env);
    const processPath = Object.keys(process.env).find((k) => k.toLowerCase() == 'path');
    setup(() => {
        kernelSpec = {
            name: 'kernel',
            executable: pathFile.fsPath,
            display_name: 'kernel',
            interpreterPath: pathFile.fsPath,
            argv: []
        };
        fs = mock<IFileSystemNode>();
        envActivation = mock<IEnvironmentActivationService>();
        customVariablesService = mock<ICustomEnvironmentVariablesProvider>();
        interpreterService = mock<IInterpreterService>();
        variablesService = new EnvironmentVariablesService(instance(fs));
        configService = mock<IConfigurationService>();
        settings = mock(JupyterSettings);
        when(configService.getSettings(anything())).thenReturn(instance(settings));
        kernelVariablesService = new KernelEnvironmentVariablesService(
            instance(interpreterService),
            instance(envActivation),
            variablesService,
            instance(customVariablesService),
            instance(configService)
        );
    });
    teardown(() => Object.assign(process.env, originalEnvVars));

    test('Interpreter path trumps process', async () => {
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({
            PATH: 'foobar'
        });
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve();

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, interpreter, kernelSpec);

        assert.isOk(processPath);
        assert.strictEqual(vars![processPath!], `${path.dirname(interpreter.uri.fsPath)}${path.delimiter}foobar`);
    });
    test('Interpreter env variable trumps process', async () => {
        process.env['HELLO_VAR'] = 'process';
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({
            HELLO_VAR: 'new'
        });
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve();

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, interpreter, kernelSpec);

        assert.strictEqual(vars['HELLO_VAR'], 'new');
        // Compare ignoring the PATH variable.
        assert.deepEqual(
            Object.assign(vars, { PATH: '', Path: '' }),
            Object.assign({}, process.env, { HELLO_VAR: 'new' }, { PATH: '', Path: '' })
        );
    });

    test('Custom env variable trumps process and interpreter envs', async () => {
        process.env['HELLO_VAR'] = 'process';
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({
            HELLO_VAR: 'interpreter'
        });
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve({ HELLO_VAR: 'new' });

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, interpreter, kernelSpec);

        assert.strictEqual(vars['HELLO_VAR'], 'new');
        // Compare ignoring the PATH variable.
        assert.deepEqual(
            Object.assign(vars, { PATH: '', Path: '' }),
            Object.assign({}, process.env, { HELLO_VAR: 'new' }, { PATH: '', Path: '' })
        );
    });

    test('Custom env variable trumps process (non-python)', async () => {
        process.env['HELLO_VAR'] = 'very old';
        delete kernelSpec.interpreterPath;
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({});
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve({ HELLO_VAR: 'new' });

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, undefined, kernelSpec);

        assert.strictEqual(vars['HELLO_VAR'], 'new');
        // Compare ignoring the PATH variable.
        assert.deepEqual(
            Object.assign(vars, { PATH: '', Path: '' }),
            Object.assign({}, process.env, { HELLO_VAR: 'new' }, { PATH: '', Path: '' })
        );
    });

    test('Returns process.env vars if no interpreter and no kernelspec.env', async () => {
        delete kernelSpec.interpreterPath;
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve();

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, undefined, kernelSpec);

        assert.deepEqual(vars, process.env);
    });

    test('Returns process.env vars if unable to get activated vars for interpreter and no kernelspec.env', async () => {
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve();
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve();

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, interpreter, kernelSpec);

        // Compare ignoring the PATH variable.
        assert.deepEqual(
            Object.assign({}, vars, { PATH: '', Path: '' }),
            Object.assign({}, process.env, { PATH: '', Path: '' })
        );
        assert.strictEqual(
            vars![processPath!],
            `${path.dirname(interpreter.uri.fsPath)}${path.delimiter}${process.env[processPath!]}`
        );
    });

    test('Paths are merged', async () => {
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({
            PATH: 'foobar'
        });
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve({ PATH: 'foobaz' });

        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, interpreter, kernelSpec);
        assert.isOk(processPath);
        assert.strictEqual(
            vars![processPath!],
            `${path.dirname(interpreter.uri.fsPath)}${path.delimiter}foobar${path.delimiter}foobaz`
        );
    });

    test('KernelSpec interpreterPath used if interpreter is undefined', async () => {
        when(interpreterService.getInterpreterDetails(anything())).thenResolve({
            envType: EnvironmentType.Conda,
            uri: Uri.joinPath(Uri.file('env'), 'foopath'),
            sysPrefix: 'foosysprefix'
        });
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({
            PATH: 'pathInInterpreterEnv'
        });
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve({ PATH: 'foobaz' });

        // undefined for interpreter here, interpreterPath from the spec should be used
        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, undefined, kernelSpec);
        assert.isOk(processPath);
        assert.strictEqual(
            vars![processPath!],
            `${path.dirname(Uri.joinPath(Uri.file('env'), 'foopath').fsPath)}${path.delimiter}pathInInterpreterEnv${
                path.delimiter
            }foobaz`
        );
    });

    async function testPYTHONNOUSERSITE(envType: EnvironmentType, shouldBeSet: boolean) {
        when(interpreterService.getInterpreterDetails(anything())).thenResolve({
            envType,
            uri: Uri.file('foopath'),
            sysPrefix: 'foosysprefix'
        });
        when(envActivation.getActivatedEnvironmentVariables(anything(), anything(), anything())).thenResolve({
            PATH: 'foobar'
        });
        when(customVariablesService.getCustomEnvironmentVariables(anything())).thenResolve({ PATH: 'foobaz' });
        when(settings.excludeUserSitePackages).thenReturn(shouldBeSet);

        // undefined for interpreter here, interpreterPath from the spec should be used
        const vars = await kernelVariablesService.getEnvironmentVariables(undefined, undefined, kernelSpec);

        if (shouldBeSet) {
            assert.isOk(vars!['PYTHONNOUSERSITE'], 'PYTHONNOUSERSITE should be set');
        } else {
            assert.isUndefined(vars!['PYTHONNOUSERSITE'], 'PYTHONNOUSERSITE should not be set');
        }
    }

    test('PYTHONNOUSERSITE should not be set for Global Interpreters', async () => {
        await testPYTHONNOUSERSITE(EnvironmentType.Global, false);
    });
    test('PYTHONNOUSERSITE should be set for Conda Env', async () => {
        await testPYTHONNOUSERSITE(EnvironmentType.Conda, true);
    });
    test('PYTHONNOUSERSITE should be set for Virtual Env', async () => {
        await testPYTHONNOUSERSITE(EnvironmentType.VirtualEnv, true);
    });
});
