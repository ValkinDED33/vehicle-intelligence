import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop()
  displayName?: string;

  /** ISO 3166-1 alpha-2, например "PL", "UA" */
  @Prop({ default: 'PL' })
  country: string;

  /** ISO 639-1, например "ru", "uk", "pl", "en" */
  @Prop({ default: 'ru' })
  language: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
