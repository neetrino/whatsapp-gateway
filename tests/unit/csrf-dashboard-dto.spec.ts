import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { CreateProjectDto } from '../../src/projects/dto/create-project.dto';
import { UpdateProjectDto } from '../../src/projects/dto/update-project.dto';
import { CreateWhatsappAccountDto } from '../../src/whatsapp-accounts/dto/create-whatsapp-account.dto';
import { RequestPairingCodeDto } from '../../src/whatsapp-accounts/dto/request-pairing-code.dto';
import { V1RequestPairingCodeDto } from '../../src/v1/dto/request-pairing-code.dto';
import { CreateTokenDto } from '../../src/api-tokens/dto/create-token.dto';
import { SendMessageDto } from '../../src/messages/dto/send-message.dto';
import { VALIDATION_PIPE_OPTIONS } from '../../src/common/pipes/validation.factory';
import { WhatsappAccountMode } from '../../src/common/db-enums';

const pipeValidateOpts = {
  whitelist: VALIDATION_PIPE_OPTIONS.whitelist,
  forbidNonWhitelisted: VALIDATION_PIPE_OPTIONS.forbidNonWhitelisted,
};

describe('Dashboard DTOs with _csrf (forbidNonWhitelisted)', () => {
  it('LoginDto accepts _csrf', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'password12',
      _csrf: 'csrf-token-value',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors).toHaveLength(0);
  });

  it('LoginDto still rejects unknown properties', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'password12',
      evil: 'x',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('CreateProjectDto accepts _csrf', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'NBOS',
      slug: 'nbos',
      _csrf: 'abc',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors).toHaveLength(0);
  });

  it('UpdateProjectDto accepts _csrf', async () => {
    const dto = plainToInstance(UpdateProjectDto, {
      name: 'NBOS',
      _csrf: 'abc',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors).toHaveLength(0);
  });

  it('CreateWhatsappAccountDto accepts _csrf', async () => {
    const dto = plainToInstance(CreateWhatsappAccountDto, {
      label: 'Main',
      mode: WhatsappAccountMode.SEND_ONLY,
      _csrf: 'abc',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors).toHaveLength(0);
  });

  it('RequestPairingCodeDto accepts _csrf and normalizes the number', async () => {
    const dto = plainToInstance(RequestPairingCodeDto, {
      phoneNumber: '+374 99 111 222',
      _csrf: 'abc',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors).toHaveLength(0);
    expect(dto.phoneNumber).toBe('37499111222');
  });

  it('CreateTokenDto accepts _csrf', async () => {
    const dto = plainToInstance(CreateTokenDto, {
      name: 't',
      _csrf: 'abc',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors).toHaveLength(0);
  });
});

describe('v1 pairing DTO rejects _csrf', () => {
  it('rejects _csrf on pairing payload', async () => {
    const dto = plainToInstance(V1RequestPairingCodeDto, {
      phoneNumber: '37499111222',
      _csrf: 'should-fail',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('API SendMessageDto unchanged (no _csrf)', () => {
  it('rejects _csrf on send payload', async () => {
    const dto = plainToInstance(SendMessageDto, {
      chatId: '37499111222@c.us',
      text: 'hi',
      _csrf: 'should-fail',
    });
    const errors = await validate(dto, pipeValidateOpts);
    expect(errors.length).toBeGreaterThan(0);
  });
});
