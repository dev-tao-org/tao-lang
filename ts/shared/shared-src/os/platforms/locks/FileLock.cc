#include <napi.h>
#include <cerrno>
#include <cstdint>
#include <string>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

class LockHandle : public Napi::ObjectWrap<LockHandle> {
 public:
  static Napi::Function Init(Napi::Env env) {
    return DefineClass(env, "FileLock", { InstanceMethod("release", &LockHandle::Release) });
  }

  LockHandle(const Napi::CallbackInfo& info) : Napi::ObjectWrap<LockHandle>(info) {
#ifdef _WIN32
    handle_ = INVALID_HANDLE_VALUE;
#else
    descriptor_ = -1;
#endif
  }

  ~LockHandle() { ReleaseHandle(); }

  void Set(intptr_t value) {
#ifdef _WIN32
    handle_ = reinterpret_cast<HANDLE>(value);
#else
    descriptor_ = value;
#endif
  }

 private:
  Napi::Value Release(const Napi::CallbackInfo& info) {
    ReleaseHandle();
    return info.Env().Undefined();
  }

  void ReleaseHandle() {
#ifdef _WIN32
    if (handle_ != INVALID_HANDLE_VALUE) {
      OVERLAPPED overlap = {};
      UnlockFileEx(handle_, 0, MAXDWORD, MAXDWORD, &overlap);
      CloseHandle(handle_);
      handle_ = INVALID_HANDLE_VALUE;
    }
#else
    if (descriptor_ >= 0) {
      flock(descriptor_, LOCK_UN);
      close(descriptor_);
      descriptor_ = -1;
    }
#endif
  }
#ifdef _WIN32
  HANDLE handle_;
#else
  int descriptor_;
#endif
};

void ThrowLockError(Napi::Env env, const std::string& path, const char* operation, unsigned long code);

const char* PortableErrorCode(unsigned long code) {
#ifdef _WIN32
  if (code == ERROR_SHARING_VIOLATION || code == ERROR_LOCK_VIOLATION) return "EBUSY";
  if (code == ERROR_ACCESS_DENIED) return "EACCES";
#else
  if (code == EBUSY) return "EBUSY";
  if (code == EACCES) return "EACCES";
  if (code == EPERM) return "EPERM";
#endif
  return "ERR_FILE_LOCK_OS";
}

Napi::Value Acquire(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "A lock file path is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  Napi::String input = info[0].As<Napi::String>();
  std::string path = input.Utf8Value();
#ifdef _WIN32
  std::u16string utf16_path = input.Utf16Value();
  std::wstring native_path(utf16_path.begin(), utf16_path.end());
  HANDLE handle = CreateFileW(native_path.c_str(), GENERIC_READ | GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (handle == INVALID_HANDLE_VALUE) {
    DWORD error = GetLastError();
    ThrowLockError(env, path, "open", error);
    return env.Undefined();
  }
  OVERLAPPED overlap = {};
  if (!LockFileEx(handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, MAXDWORD, MAXDWORD, &overlap)) {
    DWORD error = GetLastError();
    CloseHandle(handle);
    if (error == ERROR_LOCK_VIOLATION) {
      return env.Undefined();
    }
    ThrowLockError(env, path, "lock", error);
    return env.Undefined();
  }
  intptr_t opaque = reinterpret_cast<intptr_t>(handle);
#else
  int descriptor = open(path.c_str(), O_CREAT | O_RDWR | O_CLOEXEC, 0600);
  if (descriptor < 0) {
    ThrowLockError(env, path, "open", errno);
    return env.Undefined();
  }
  if (flock(descriptor, LOCK_EX | LOCK_NB) != 0) {
    int error = errno;
    close(descriptor);
    if (error == EWOULDBLOCK || error == EAGAIN) {
      return env.Undefined();
    }
    ThrowLockError(env, path, "lock", error);
    return env.Undefined();
  }
  intptr_t opaque = descriptor;
#endif
  Napi::Object object = LockHandle::Init(env).New({});
  Napi::ObjectWrap<LockHandle>::Unwrap(object)->Set(opaque);
  return object;
}

void ThrowLockError(Napi::Env env, const std::string& path, const char* operation, unsigned long code) {
  std::string message = "Cannot " + std::string(operation) + " file lock file '" + path + "' (OS error "
      + std::to_string(code) + ")";
  Napi::Error error = Napi::Error::New(env, message);
  error.Set("code", Napi::String::New(env, PortableErrorCode(code)));
  error.Set("operation", Napi::String::New(env, operation));
  error.Set("osCode", Napi::Number::New(env, static_cast<double>(code)));
  error.ThrowAsJavaScriptException();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("acquire", Napi::Function::New(env, Acquire));
  return exports;
}

NODE_API_MODULE(tao_os_locks, Init)
