export interface Procedure {
  SchemaName: string;
  ProcedureName: string;
  CreatedDate: string;
  ModifyDate: string;
  ObjectId: number;
}

export interface Parameter {
  ParameterName: string;
  DataType: string;
  MaxLength: number;
  Precision: number;
  Scale: number;
  IsOutput: boolean;
}

export interface ResultSet {
  columns: string[];
  rows: any[];
}
