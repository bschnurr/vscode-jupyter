// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { assert } from 'chai';
import { traceInfo } from '../../../platform/logging';
import { IDisposable } from '../../../platform/common/types';
import { waitForCondition } from '../../common.node';
import { closeActiveWindows, initialize } from '../../initialize.node';
import {
    startJupyterServer,
    closeNotebooksAndCleanUpAfterTests,
    createEmptyPythonNotebook,
    insertCodeCell,
    runAllCellsInActiveNotebook,
    waitForExecutionCompletedSuccessfully
} from '../notebook/helper.node';
import { createJupyterCellFromVSCNotebookCell } from '../../../kernels/execution/helpers';
import { window } from 'vscode';

suite('VSCode Notebook PlotViewer integration - VSCode Notebook @webview', function () {
    const disposables: IDisposable[] = [];
    // On conda these take longer for some reason.
    this.timeout(120_000);

    suiteSetup(async function () {
        await initialize();
        await startJupyterServer();
    });

    setup(async function () {
        traceInfo(`Start Test ${this.currentTest?.title}`);
        traceInfo(`Start Test Completed ${this.currentTest?.title}`);
    });

    teardown(async function () {
        traceInfo(`End Test ${this.currentTest?.title}`);
        await closeNotebooksAndCleanUpAfterTests(disposables);
        traceInfo(`End Test Completed ${this.currentTest?.title}`);
    });
    suiteTeardown(() => closeNotebooksAndCleanUpAfterTests(disposables));

    test('Verify plot viewer is active for PNG plots', async function () {
        await startJupyterServer();
        await closeActiveWindows();
        await createEmptyPythonNotebook(disposables);
        assert.isOk(window.activeNotebookEditor, 'No active notebook');
        await insertCodeCell(
            `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
x = np.linspace(0, 20, 100)
plt.plot(x, np.sin(x))
plt.show()`,
            { index: 0 }
        );

        const plotCell = window.activeNotebookEditor?.notebook.cellAt(0)!;

        await runAllCellsInActiveNotebook();
        await waitForExecutionCompletedSuccessfully(plotCell);

        await waitForCondition(async () => plotCell?.outputs.length >= 1, 10000, 'Plot output not generated');
        // Sometimes on CI we end up with >1 output, and the test fails, but we're expecting just one.
        if (plotCell.outputs.length !== 1) {
            const jupyterCell = createJupyterCellFromVSCNotebookCell(plotCell);
            traceInfo(`Plot cell has ${plotCell.outputs.length} outputs, Cell JSON = ${JSON.stringify(jupyterCell)}`);
        }
        assert.strictEqual(plotCell.outputs.length, 1, 'Plot cell output incorrect count');

        // Check if our metadata has __displayOpenPlotIcon
        assert(plotCell.outputs[0]!.metadata!.__displayOpenPlotIcon == true, 'Open Plot Icon missing from metadata');
        // Check our output mime types
        assert(
            plotCell.outputs[0]!.items.some((outputItem) => outputItem.mime === 'image/png'),
            'PNG Mime missing'
        );
        assert(
            plotCell.outputs[0]!.items.some((outputItem) => outputItem.mime === 'text/plain'),
            'Plain Text Mime missing'
        );
    });
});
