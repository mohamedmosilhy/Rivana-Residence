import type {
  Actor,
  FacilityRepository,
  PageRepository,
  RoomRepository,
} from "@/application/ports/repositories";
import type { Result } from "@/application/shared/result";
import type { PageKey } from "@/domain/content/page-sections";

export class PublishRoom {
  constructor(private readonly rooms: RoomRepository) {}

  execute(id: string, actor: Actor) {
    return this.rooms.publish(id, actor);
  }
}

export class PublishFacility {
  constructor(private readonly facilities: FacilityRepository) {}

  execute(id: string, actor: Actor) {
    return this.facilities.publish(id, actor);
  }
}

export class PublishPage {
  constructor(private readonly pages: PageRepository) {}

  execute(key: PageKey, actor: Actor): Promise<Result<unknown>> {
    return this.pages.publish(key, actor);
  }
}
