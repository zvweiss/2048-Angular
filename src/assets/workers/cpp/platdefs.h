#pragma once

#include <stdint.h>
#include <stdlib.h>
#include <sys/time.h>

#ifdef _WIN32
#define DLL_PUBLIC __declspec(dllexport)
#else
#define DLL_PUBLIC __attribute__((visibility("default")))
#endif

static inline int unif_random(int n) {
  return rand() % n;
}
