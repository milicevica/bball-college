/** One row of the Google Sheet */
export interface Team {
  id: string
  name: string
  conference: string
  location: string
  /** USPS code parsed from "City, ST" locations, if present */
  state?: string
  coach: string
  notes: string
}

export interface TeamsResponse {
  /** ISO timestamp of when the sheet was last read */
  updatedAt: string
  teams: Team[]
}
