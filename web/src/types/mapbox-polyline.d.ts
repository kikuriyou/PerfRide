declare module '@mapbox/polyline' {
  export function decode(encoded: string, precision?: number): Array<[number, number]>;

  export function encode(coordinates: Array<[number, number]>, precision?: number): string;

  export function fromGeoJSON(geojson: object, precision?: number): string;

  export function toGeoJSON(
    encoded: string,
    precision?: number,
  ): {
    type: string;
    coordinates: Array<[number, number]>;
  };
}
