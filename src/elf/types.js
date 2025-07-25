//
// Elf Types
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Elf Constants
//-----------------------------------------------------------------------------------------------//

const ElfConstants = {

    MagicNumber: 0x7f454c46, // 7F+'ELF'

    FormatElf32: 1,
    FormatElf64: 2,

    LittleEndian: 1,
    BigEndian: 2,

    Architecture32: 1,
    Architecture64: 2,

    FileTypeExecutable: 2,

    SymbolBindingLocal: 0,
    SymbolBindingGlobal: 1,
    SymbolBindingWeak: 2,

    SymbolTypeNone: 0,
    SymbolTypeObject: 1,
    SymbolTypeFunction: 2,
    SymbolTypeSection: 3,
    SymbolTypeFile: 4,

};

const ElfSectionTypes = {
    None: 0,
    ProgBits: 1,
    SymbolTable: 2,
    StringTable: 3,
};

//-----------------------------------------------------------------------------------------------//
// Dwarf Constants
//-----------------------------------------------------------------------------------------------//

const DwarfTypeCodes = {
    None: 0,
    Path: 1,
    Index: 2,
    Timestamp: 3,
    Size: 4,
    MD5: 5
};

const DwarfFormCodes = {
    None: 0x00,

    Address: 0x01,
    AddrX: 0x1b,
    AddrX1: 0x29,
    AddrX2: 0x2a,
    AddrX3: 0x2b,
    AddrX4: 0x2c,

    String: 0x08,
    StrP: 0x0e,
    StrX: 0x1a,
    StrX1: 0x25,
    StrX2: 0x26,
    StrX3: 0x27,
    StrX4: 0x28,
    StrpSup: 0x1d,
    LineStringRef: 0x1f,

    Data1: 0x0b,
    Data2: 0x05,
    Data4: 0x06,
    Data8: 0x07,
    Data16: 0x1e,
    ImplicitConst: 0x21,

    SData: 0x0d,
    UData: 0x0f,

    Block: 0x09,
    Block1: 0x0a,
    Block2: 0x03,
    Block4: 0x04,

    RefAddr: 0x10,
    Ref1: 0x11,
    Ref2: 0x12,
    Ref4: 0x13,
    Ref8: 0x14,
    RefUData: 0x15,
    RefSup4: 0x1c,
    RefSup8: 0x24,
    RefSig8: 0x20,

    Flag: 0x0c,
    FlagPresent: 0x19,

    SecOffset: 0x17,
    ExprLoc: 0x18,
    LocListX: 0x22,
    RngListX: 0x23,
    Indirect: 0x16,
};

const DwarfAttributeIds = {
    Sibling: 0x01,
    Location: 0x02,
    Name: 0x03,
    Ordering: 0x09,
    ByteSize: 0x0b,
    BitSize: 0x0d,
    StmtList: 0x10,
    LowPc: 0x11,
    HighPc: 0x12,
    Language: 0x13,
    Discr: 0x15,
    DiscrValue: 0x16,
    Visibility: 0x17,
    Import: 0x18,
    StringLength: 0x19,
    CommonReference: 0x1a,
    CompDir: 0x1b,
    ConstValue: 0x1c,
    ContainingType: 0x1d,
    DefaultValue: 0x1e,
    Inline: 0x20,
    IsOptional: 0x21,
    LowerBound: 0x22,
    Producer: 0x25,
    Prototyped: 0x27,
    ReturnAddr: 0x2a,
    StartScope: 0x2c,
    BitStride: 0x2e,
    UpperBound: 0x2f,
    AbstractOrigin: 0x31,
    Accessibility: 0x32,
    AddressClass: 0x33,
    Artificial: 0x34,
    BaseTypes: 0x35,
    CallingConvention: 0x36,
    Count: 0x37,
    DataMemberLocation: 0x38,
    DeclColumn: 0x39,
    DeclFile: 0x3a,
    DeclLine: 0x3b,
    Declaration: 0x3c,
    DiscrList: 0x3d,
    Encoding: 0x3e,
    External: 0x3f,
    FrameBase: 0x40,
    Friend: 0x41,
    IdentifierCase: 0x42,
    NamelistItem: 0x44,
    Priority: 0x45,
    Segment: 0x46,
    Specification: 0x47,
    StaticLink: 0x48,
    Type: 0x49,
    UseLocation: 0x4a,
    VariableParameter: 0x4b,
    Virtuality: 0x4c,
    VtableElemLocation: 0x4d,
    Allocated: 0x4e,
    Associated: 0x4f,
    DataLocation: 0x50,
    ByteStride: 0x51,
    EntryPc: 0x52,
    UseUTF8: 0x53,
    Extension: 0x54,
    Ranges: 0x55,
    Trampoline: 0x56,
    CallColumn: 0x57,
    CallFile: 0x58,
    CallLine: 0x59,
    Description: 0x5a,
    BinaryScale: 0x5b,
    DecimalScale: 0x5c,
    Small: 0x5d,
    DecimalSign: 0x5e,
    DigitCount: 0x5f,
    PictureString: 0x60,
    Mutable: 0x61,
    ThreadsScaled: 0x62,
    Explicit: 0x63,
    ObjectPointer: 0x64,
    Endianity: 0x65,
    Elemental: 0x66,
    Pure: 0x67,
    Recursive: 0x68,
    Signature: 0x69,
    MainSubprogram: 0x6a,
    DataBitOffset: 0x6b,
    ConstExpr: 0x6c,
    EnumClass: 0x6d,
    LinkageName: 0x6e,
    StringLengthBitSize: 0x6f,
    StringLengthByteSize: 0x70,
    Rank: 0x71,
    StrOffsetsBase: 0x72,
    AddrBase: 0x73,
    RnglistsBase: 0x74,
    DwoName: 0x76,
    Reference: 0x77,
    RvalueReference: 0x78,
    Macros: 0x79,
    CallAllCalls: 0x7a,
    CallAllSourceCalls: 0x7b,
    CallAllTailCalls: 0x7c,
    CallReturnPc: 0x7d,
    CallValue: 0x7e,
    CallOrigin: 0x7f,
    CallParameter: 0x80,
    CallPc: 0x81,
    CallTailCall: 0x82,
    CallTarget: 0x83,
    CallTargetClobbered: 0x84,
    CallDataLocation: 0x85,
    CallDataValue: 0x86,
    Noreturn: 0x87,
    Alignment: 0x88,
    ExportSymbols: 0x89,
    Deleted: 0x8a,
    Defaulted: 0x8b,
    LoclistsBase: 0x8c,
    LoUser: 0x2000,
    HiUser: 0x3f
};

const DwarfTagIds = {
    ArrayType: 0x01,
    ClassType: 0x02,
    EntryPoint: 0x03,
    EnumerationType: 0x04,
    FormalParameter: 0x05,
    ImportedDeclaration: 0x08,
    Label: 0x0a,
    LexicalBlock: 0x0b,
    Member: 0x0d,
    PointerType: 0x0f,
    ReferenceType: 0x10,
    CompileUnit: 0x11,
    StringType: 0x12,
    StructureType: 0x13,
    SubroutineType: 0x15,
    Typedef: 0x16,
    UnionType: 0x17,
    UnspecifiedParameters: 0x18,
    Variant: 0x19,
    CommonBlock: 0x1a,
    CommonInclusion: 0x1b,
    Inheritance: 0x1c,
    InlinedSubroutine: 0x1d,
    Module: 0x1e,
    PtrToMemberType: 0x1f,
    SetType: 0x20,
    SubrangeType: 0x21,
    WithStmt: 0x22,
    AccessDeclaration: 0x23,
    BaseType: 0x24,
    CatchBlock: 0x25,
    ConstType: 0x26,
    Constant: 0x27,
    Enumerator: 0x28,
    FileType: 0x29,
    Friend: 0x2a,
    Namelist: 0x2b,
    NamelistItem: 0x2c,
    PackedType: 0x2d,
    Subprogram: 0x2e,
    TemplateTypeParameter: 0x2f,
    TemplateValueParameter: 0x30,
    ThrownType: 0x31,
    TryBlock: 0x32,
    VariantPart: 0x33,
    Variable: 0x34,
    VolatileType: 0x35,
    DwarfProcedure: 0x36,
    RestrictType: 0x37,
    InterfaceType: 0x38,
    Namespace: 0x39,
    ImportedModule: 0x3a,
    UnspecifiedType: 0x3b,
    PartialUnit: 0x3c,
    ImportedUnit: 0x3d,
    Condition: 0x3f,
    SharedType: 0x40,
    TypeUnit: 0x41,
    RvalueReferenceType: 0x42,
    TemplateAlias: 0x43,
    CoarrayType: 0x44,
    GenericSubrange: 0x45,
    DynamicType: 0x46,
    AtomicType: 0x47,
    CallSite: 0x48,
    CallSiteParameter: 0x49,
    SkeletonUnit: 0x4a,
    ImmutableType: 0x4b
};

const DwarfUnitTypes = {
    Compile: 0x01,
    Type: 0x02,
    Partial: 0x03,
    Skeleton: 0x04,
    SplitCompile: 0x05,
    SplitType: 0x06,
    LoUser: 0x80,
    HiUser: 0xff
};


//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfConstants: ElfConstants,
    ElfSectionTypes: ElfSectionTypes,
    DwarfTypeCodes: DwarfTypeCodes,
    DwarfFormCodes: DwarfFormCodes,
    DwarfAttributeIds: DwarfAttributeIds,
    DwarfTagIds: DwarfTagIds,
    DwarfUnitTypes: DwarfUnitTypes
};
