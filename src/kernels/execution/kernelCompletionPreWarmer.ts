// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IExtensionSyncActivationService } from '../../platform/activation/types';
import { IDisposableRegistry } from '../../platform/common/types';
import { noop } from '../../platform/common/utils/misc';
import { isPythonKernelConnection } from '../helpers';
import { IKernelProvider } from '../types';
import type { Kernel } from '@jupyterlab/services';

@injectable()
export class KernelCompletionsPreWarmer implements IExtensionSyncActivationService {
    constructor(
        @inject(IKernelProvider) private readonly kernelProvider: IKernelProvider,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry
    ) {}
    activate(): void {
        this.kernelProvider.onDidStartKernel(
            (kernel) => {
                if (kernel.session?.kernel && isPythonKernelConnection(kernel.kernelConnectionMetadata)) {
                    this.requestEmptyCompletions(kernel.session.kernel);
                }
            },
            this,
            this.disposables
        );
    }
    /**
     * Do not wait for completions,
     * If the completions request crashes then we don't get a response for this request,
     * Hence we end up waiting indefinitely.
     * https://github.com/microsoft/vscode-jupyter/issues/9014
     */
    private requestEmptyCompletions(kernel: Kernel.IKernelConnection) {
        kernel
            ?.requestComplete({
                code: '__file__.',
                cursor_pos: 9
            })
            .catch(noop);
    }
}
