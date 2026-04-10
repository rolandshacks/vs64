/**
 * SID Analyze
 * ATTENTION: THIS IS JUST A PROTOTYPE.
 * @module Web
 */

import { CPU6502 } from '../../packages/cpu/cpu.js';

/**
 * SID Analyze.
 */
class SidAnalyzer {
    constructor() {
        this.samples = null;
    }

    analyze(media) {
        this.samples = null;

        if (null == media) return;

        const vm = new CPU6502();
        vm.reset();
        vm._memory[0x1] = 0x04; // disable all ROMs / bank switching

        const loadAddr = media._loadAddress;
        const loadData = media.data.subarray(media._dataOffset, media._dataOffset + media._dataSize);
        vm._memory.set(loadData, loadAddr);

        let timeout = false;

        // initialize
        {
            vm.setPC(media._initAddress);
            vm.A = 0x0; vm.X = 0x0; vm.Y = 0x0;
            vm.resetCycleCounter();
            let done = false;
            while (!done && !timeout) {
                const opcode = vm._opcode;
                if (opcode == 0x60 && vm._callStack.length == 0) {
                    done = true;
                }
                vm.step();

                if (vm.cycleCounter > 10000) timeout=true;
            }
        }

        const maxSamples = 1000;
        const samples = [];

        let avgPlayCycles = 0;
        let cycleCounterTotal = 0;

        // run
        {
            const mem = vm._memory;
            vm.A = 0x0; vm.X = 0x0; vm.Y = 0x0;
            let i=0;
            while(!timeout && samples.length < maxSamples) {
                vm.setPC(media._playAddress);
                vm.resetCycleCounter();
                let done = false;
                while (!done && !timeout) {
                    const opcode = vm._opcode;
                    if (opcode == 0x60 && vm._callStack.length == 0) {
                        done = true;
                    }
                    vm.step();
                    if (vm.cycleCounter > 10000) timeout=true;
                }

                if (timeout) break;

                if ((i%200) == 0) {
                    const sample = [];
                    sample.push(((mem[0xd400]+mem[0xd401]*256))/65536.0);
                    sample.push(((mem[0xd407]+mem[0xd408]*256))/65536.0);
                    sample.push(((mem[0xd40e]+mem[0xd40f]*256))/65536.0);
                    samples.push(sample);
                }

                i++;
                cycleCounterTotal += vm.cycleCounter;
            }

            if (i > 0) {
                avgPlayCycles = Math.floor(cycleCounterTotal / i);
            }
        }

        this.avgPlayCycles = cycleCounterTotal;
        this.samples = samples;
    }

    render(ui, viewSize, metrics) {
        const samples = this.samples;
        if (null == samples) return;

        const ctx = ui.content.ctx;

        const canvasWidth = viewSize.x - 40;
        const canvasHeight = 256;

        // resize canvas
        ui.content.width = canvasWidth + 1;
        ui.content.height = canvasHeight + 1;

        const colors = ["#40a040", "#a04040", "#4040a0"];

        const sampleSize = samples.length > 0 ? samples[0].length : 0;
        for (let j=0; j<sampleSize; j++) {

            let x = 0;

            ctx.strokeStyle = colors[j%colors.length];
            ctx.beginPath();
            ctx.moveTo(x, canvasHeight);

            for (let i=0; i<samples.length; i++) {
                x = i;
                if (x >= canvasWidth) break;
                const v = samples[i][j];
                const y = canvasHeight - v*canvasHeight;
                ctx.lineTo(x, y);
            }

            ctx.stroke();
        }
    }
}

export {
    SidAnalyzer as SidAnalyzer
};
