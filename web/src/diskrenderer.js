/**
 * Disk Renderer
 * @module Web
 */

import { Factory } from "./factory.js";
import { MediaRenderer } from "./mediarenderer.js";
import { Color } from "./imports.js";

import {
    Disk, Position, File
} from "./media.js";

// renderer class identifiers
const DISK_MEDIA_RENDERER_CLASSNAME = "render.media.disk";

class DiskMediaRenderer extends MediaRenderer {
    constructor(...args) {
        super(...args);
    }

    static createInstance(...args) {
        return new DiskMediaRenderer(...args);
    }

    render() {
        const context = this.getContext();
        if (null == context) return;
        const ui = context.ui;
        const viewSize = context.viewsize;
        const metrics = context.metrics;
        const style = context.style;
        const ctx = context.ctx;

        const media = this.getMedia();
        if (null == media) return;

        if (null == media.disk) return;

        const disk = media.disk;
        const dir = disk.directory;
        const bam = disk.getBam();

        const viewSizeX = viewSize.x - metrics.containerPadding * 2;
        const viewSizeY = viewSizeX; // just us a quadratic size

        const displayWidth = Math.max(16, viewSizeX - metrics.containerPadding);
        const displayHeight = Math.max(16, viewSizeY);

        const canvasWidth = displayWidth * 1.0; // metrics.scale;
        const canvasHeight =displayHeight * 1.0; //metrics.scale;

        // resize canvas
        ui.content.style.width = (canvasWidth / metrics.devicePixelRatio) + "px";
        ui.content.style.height = (canvasHeight / metrics.devicePixelRatio) + "px";
        ui.content.width = canvasWidth;
        ui.content.height = canvasHeight;

        const _diskPhysicalSizeMM = 130; // mm
        const diskPhysicalOuterMM = 120; // mm
        const diskPhysicalInnerMM = 50; // mm
        const diskPhysicalRatio = (diskPhysicalOuterMM - diskPhysicalInnerMM) / diskPhysicalOuterMM;

        const numTracks = disk.numTracks;

        const x_center = Math.floor(canvasWidth / 2);
        const y_center = Math.floor(canvasHeight / 2);
        const maxRadius = Math.max(32, Math.floor(Math.min(canvasWidth, canvasHeight) * 0.4));
        const minRadius = Math.floor(maxRadius - maxRadius * diskPhysicalRatio);
        const rangeRadius = maxRadius-minRadius;
        const trackWidth = rangeRadius / (numTracks+1);

        const trackPadding = Math.floor(Math.max(3, trackWidth / 8));

        const bitsPerByte = new Uint8Array(256);
        for (let i=0; i<256; i++) {
            let c = 0;
            for (let j=0; j<8; j++) {
                if ((i&(1<<j))!=0x0) {
                    c++;
                }
            }
            bitsPerByte[i] = c;
        }

        const colorUsed = Color.fromCss(style.foregroundColor);
        const colorUnused = Color.fromCss(style.buttonBackground);

        for (let track = 0; track < disk.numTracks; track++) {

            const radiusOuter = Math.floor(maxRadius - (trackWidth * track));
            const radiusInner = Math.floor(radiusOuter - trackWidth);
            const ofsAngle = Math.PI*1.5;

            const numSectors = Disk.getNumSectorsPerTrack(track+1);
            const sectorStep = Math.PI * 2.0 / numSectors;
            const sectorWidth = sectorStep;
            const position = new Position(track+1, 0);

            const numSlices = 16; // slicing from a 256 bytes vector to 16 x 16 bytes slices
            const sliceWidth = sectorWidth / numSlices;

            // draw sectors
            ctx.strokeStyle = style.backgroundColor;
            ctx.lineWidth = trackPadding;
            ctx.fillStyle = style.buttonBackground;

            for (let sector = 0; sector < numSectors; sector++) {

                // draw sectors
                const startAngle = - (sector+1) * sectorStep;
                const endAngle = startAngle + sectorWidth;
                const sectorStatus = bam.getSectorStatus(position);

                if (!sectorStatus) {
                    // draw unused sectors
                    ctx.beginPath();
                    ctx.arc(x_center, y_center, radiusOuter, ofsAngle + startAngle, ofsAngle + endAngle, false);
                    ctx.arc(x_center, y_center, radiusInner, ofsAngle + endAngle, ofsAngle+ startAngle, true);
                    ctx.closePath(); ctx.stroke();
                    ctx.fill();
                }

                // draw sector slices to indicate usage status
                const sectorData = disk.readSector(position);
                const sliceBytes = Math.floor(sectorData.length / numSlices);
                const sliceBitCountMax = sliceBytes * 8;
                for (let slice=0; slice<numSlices; slice++) {
                    let sliceBitCount = 0;
                    for (let i=0; i<sliceBytes; i++) {
                        sliceBitCount += bitsPerByte[sectorData[slice * sliceBytes + i]];
                    }
                    const sliceBitUsageRatio = sliceBitCountMax > 0 ? (sliceBitCount / sliceBitCountMax) : 0;

                    if (sectorStatus) {
                        const sliceStartAngle = startAngle + slice * sliceWidth;
                        const sliceEndAngle = sliceStartAngle + sliceWidth;
                        const col = Color.blend(colorUsed, colorUnused, sliceBitUsageRatio);
                        ctx.fillStyle = col.toCss();
                        ctx.beginPath();
                        ctx.arc(x_center, y_center, radiusOuter, ofsAngle + sliceStartAngle, ofsAngle + sliceEndAngle, false);
                        ctx.arc(x_center, y_center, radiusInner, ofsAngle + sliceEndAngle, ofsAngle + sliceStartAngle, true);
                        ctx.closePath(); ctx.stroke();
                        ctx.fill();
                    }
                }

                position.inc();
            }
        }

        if (null != ui.c64text) {
            let s = "";

            s += "0 \"" + (disk.name + "                ").substring(0, 16) + "\" " +
                (disk.id + "  ").substring(0, 2) + " " +
                disk.version + disk.format +
                "\n";

            const numSectors = disk.numSectors;
            let numUsedSectors = 0;

            for (const entry of dir) {
                if (entry.type != File.TYPE_DEL) {
                    s += entry.toString() + "\n";
                    numUsedSectors += entry.size;
                }
            }

            const freeSectors = Math.max(0, numSectors - numUsedSectors - Disk.RESERVED_SECTORS);
            s += freeSectors + " BLOCKS FREE.\n";

            ui.c64text.innerText = s;
            ui.c64textbox.visible = true;
        }
    }
}

DiskMediaRenderer.ClassName = DISK_MEDIA_RENDERER_CLASSNAME;

Factory.register(DiskMediaRenderer);

export {
    DiskMediaRenderer as DiskMediaRenderer
};
