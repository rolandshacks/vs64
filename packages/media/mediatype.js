//
// Media Types
//

const MediaClassId = {
    UNKNOWN: "media.unknown",
    SID: "media.sid",
    CHARSET: "media.charset",
    SPRITES: "media.sprites",
    DISK: "media.disk",
    TAPE: "media.tape",
    SPRITES_SPRITEPAD: "media.sprites.spd",
    SPRITES_SPRITEMATE: "media.sprites.spm"
};

const MediaType = {
    UNKNOWN: 0,
    SID: 1,
    CHARSET: 2,
    SPRITES: 3,
    DISK: 4,
    TAPE: 5,
    ClassId: [
        MediaClassId.UNKNOWN,
        MediaClassId.SID,
        MediaClassId.CHARSET,
        MediaClassId.SPRITES,
        MediaClassId.DISK,
        MediaClassId.TAPE
    ]
};

MediaType.fromExtension = function(ext) {
    if (null != ext) {
        switch (ext.toLowerCase()) {
            case "sid": return MediaType.SID;
            case "d64": return MediaType.DISK;
            case "t64": return MediaType.TAPE;
            case "ctm": return MediaType.CHARSET;
            case "spd": return MediaType.SPRITES;
            case "spm": return MediaType.SPRITES;
            default: break;
        }
    }
    return MediaType.UNKNOWN;
}

MediaType.classFromType = function(mediaType) {
    return MediaType.ClassId[mediaType];
}

MediaType.classFromExtension = function(ext) {
    const mediaType = MediaType.fromExtension(ext);
    return MediaType.classFromType(mediaType) + (null != ext && ext.length > 0 ? ("." + ext) : "");
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    MediaType: MediaType,
    MediaClassId: MediaClassId
};
